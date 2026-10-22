using System.Net;
using System.Net.Http.Headers;
using System.Reflection;
using System.Text;
using System.Text.Json;
using LinhaZero.Api.Repositories;
using Microsoft.Extensions.Options;

namespace LinhaZero.Api.Services;

/// <summary>Why a request to Anthropic failed before anything was streamed: the status and message for the browser.</summary>
public sealed record AssistantFailure(int Status, string Message);

/// <summary>
/// The assistant's link to Anthropic (docs/decisoes/0074). The browser runs the conversation with the Anthropic SDK
/// pointed at this API; this class keeps only the conversation from its request, adds everything else the server
/// decides (model, system prompt, tools, limits, the key), sends it to the Messages API and streams the answer back
/// byte for byte, so the SDK in the browser reads it as if it came from Anthropic. It also reads the token counts
/// from the stream, to record what each response cost.
/// </summary>
public sealed class AssistantProxy(
    HttpClient http,
    IOptions<AssistantOptions> options,
    AssistantUsageRepository usage,
    ILogger<AssistantProxy> log)
{
    public static readonly Uri BaseAddress = new("https://api.anthropic.com/");
    public const string ApiVersion = "2023-06-01";

    /// <summary>Read once; byte-identical on every request, so Anthropic serves them from its prompt cache.</summary>
    public static readonly string SystemPrompt = Resource("system-prompt.md");
    public static readonly JsonElement Tools = JsonDocument.Parse(Resource("tools.json")).RootElement.Clone();

    private static readonly JsonSerializerOptions SnakeCase = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>The Messages API request for this conversation, with everything but the messages set here.</summary>
    public static string UpstreamBody(IReadOnlyList<JsonElement> messages, AssistantOptions settings) =>
        JsonSerializer.Serialize(
            new UpstreamRequest(
                settings.Model,
                settings.MaxTokens,
                Stream: true,
                // Breakpoint 1: tools and system prompt. Breakpoint 2 (top level): the conversation so far, so each
                // turn pays full price only for what is new.
                System: [new SystemBlock("text", SystemPrompt, Ephemeral)],
                Tools,
                messages,
                new OutputConfig(settings.Effort),
                Ephemeral),
            SnakeCase);

    /// <summary>
    /// Sends the conversation and streams the answer into <paramref name="response"/>. Returns null when it streamed,
    /// or the failure to answer with when Anthropic refused before streaming.
    /// </summary>
    public async Task<AssistantFailure?> ForwardAsync(Guid userId, IReadOnlyList<JsonElement> messages, HttpResponse response, CancellationToken ct)
    {
        var settings = options.Value;
        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/messages")
        {
            Content = new StringContent(UpstreamBody(messages, settings), Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("x-api-key", settings.ApiKey);
        request.Headers.Add("anthropic-version", ApiVersion);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

        using var reply = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!reply.IsSuccessStatusCode)
        {
            var detail = await reply.Content.ReadAsStringAsync(ct);
            log.LogWarning("Anthropic respondeu {Status}: {Detail}", (int)reply.StatusCode, detail);
            return Failure(reply.StatusCode, detail);
        }

        response.StatusCode = StatusCodes.Status200OK;
        response.ContentType = "text/event-stream";
        response.Headers.CacheControl = "no-cache";

        var meter = new AssistantStreamMeter();
        try
        {
            await using var upstream = await reply.Content.ReadAsStreamAsync(ct);
            using var reader = new StreamReader(upstream, Encoding.UTF8);
            while (await reader.ReadLineAsync(ct) is { } line)
            {
                meter.Read(line);
                await response.WriteAsync(line + "\n", ct);
                // An empty line ends an SSE event: send it now, not when a buffer fills.
                if (line.Length == 0)
                {
                    await response.Body.FlushAsync(ct);
                }
            }

            await response.Body.FlushAsync(ct);
        }
        finally
        {
            // Also when the browser went away mid-answer: the tokens up to then were billed.
            if (meter.Usage is { } used)
            {
                await usage.InsertAsync(userId, settings.Model, used, settings.CostUsd(used), CancellationToken.None);
            }
        }

        return null;
    }

    /// <summary>
    /// What the browser is told when Anthropic refused. Anthropic also answers 400 to a bad key setup (for example a
    /// key not scoped to a workspace), which a new conversation would not fix: that one is the server's problem.
    /// </summary>
    public static AssistantFailure Failure(HttpStatusCode status, string detail) => (int)status switch
    {
        400 when detail.Contains("API key", StringComparison.OrdinalIgnoreCase)
            || detail.Contains("workspace", StringComparison.OrdinalIgnoreCase) =>
            new(StatusCodes.Status503ServiceUnavailable, "O assistente está mal configurado no servidor."),
        400 => new(StatusCodes.Status400BadRequest, "A conversa ficou num estado inválido. Comece uma nova conversa."),
        401 or 403 => new(StatusCodes.Status503ServiceUnavailable, "O assistente está mal configurado no servidor."),
        413 => new(StatusCodes.Status400BadRequest, "A conversa ficou demasiado longa. Comece uma nova conversa."),
        429 => new(StatusCodes.Status429TooManyRequests, "O assistente está sobrecarregado. Tente daqui a um minuto."),
        _ => new(StatusCodes.Status503ServiceUnavailable, "O assistente está indisponível. Tente daqui a pouco."),
    };

    private static string Resource(string name)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var full = assembly.GetManifestResourceNames().Single(n => n.EndsWith($".Assistant.{name}", StringComparison.Ordinal));
        using var stream = assembly.GetManifestResourceStream(full)!;
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private static readonly CacheControl Ephemeral = new("ephemeral");

    private sealed record UpstreamRequest(
        string Model,
        int MaxTokens,
        bool Stream,
        IReadOnlyList<SystemBlock> System,
        JsonElement Tools,
        IReadOnlyList<JsonElement> Messages,
        OutputConfig OutputConfig,
        CacheControl CacheControl);

    private sealed record SystemBlock(string Type, string Text, CacheControl CacheControl);

    private sealed record OutputConfig(string Effort);

    private sealed record CacheControl(string Type);
}

/// <summary>
/// Reads the token counts out of a Messages API stream, one line at a time: <c>message_start</c> carries the input
/// (uncached, written to cache, read from cache) and <c>message_delta</c> the output so far, which is cumulative.
/// </summary>
public sealed class AssistantStreamMeter
{
    private static readonly JsonSerializerOptions SnakeCase = new() { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower };

    public AssistantUsage? Usage { get; private set; }

    public void Read(string line)
    {
        if (!line.StartsWith("data:", StringComparison.Ordinal) || !line.Contains("\"message_", StringComparison.Ordinal))
        {
            return;
        }

        StreamEvent? streamEvent;
        try
        {
            streamEvent = JsonSerializer.Deserialize<StreamEvent>(line.AsSpan(5).Trim(), SnakeCase);
        }
        catch (JsonException)
        {
            return; // not ours to judge: the browser's SDK reports a broken stream
        }

        var counts = streamEvent?.Type switch
        {
            "message_start" => streamEvent.Message?.Usage,
            "message_delta" => streamEvent.Usage,
            _ => null,
        };
        if (counts is null)
        {
            return;
        }

        var previous = Usage ?? new AssistantUsage(0, 0, 0, 0);
        Usage = new AssistantUsage(
            counts.InputTokens ?? previous.InputTokens,
            counts.CacheCreationInputTokens ?? previous.CacheWriteTokens,
            counts.CacheReadInputTokens ?? previous.CacheReadTokens,
            counts.OutputTokens ?? previous.OutputTokens);
    }

    private sealed record StreamEvent(string? Type, StreamMessage? Message, StreamUsage? Usage);

    private sealed record StreamMessage(StreamUsage? Usage);

    private sealed record StreamUsage(int? InputTokens, int? CacheCreationInputTokens, int? CacheReadInputTokens, int? OutputTokens);
}
