using System.Net;
using System.Text.Json;
using LinhaZero.Core.Database;
using LinhaZero.Core.Sources;

namespace LinhaZero.Ingest.Services;

/// <summary>
/// One pull of one (source, key): fetch, check the body parses into its typed model, save the snapshot, record the
/// attempt. After a failure no new attempt is made for 60 s, or until a 429's Retry-After has passed (whichever is
/// longer). The wait is saved in source_status.retry_after, so a restart never hammers fogos.pt.
/// </summary>
public sealed class Puller(SnapshotStore snapshots, TimeProvider clock, ILogger<Puller> log)
{
    public static readonly TimeSpan MinBackoff = TimeSpan.FromSeconds(60);
    public const string InvalidBody = "resposta vazia ou inválida";

    /// <summary>The body to save, or the error and how long to wait before the next attempt.</summary>
    public sealed record Outcome(string? Body, string? Error, TimeSpan Backoff);

    /// <summary>Returns true when a new snapshot was saved. Skips the fetch while source_status.retry_after is in the future.</summary>
    public async Task<bool> PullAsync<TFile>(string source, string key, Func<CancellationToken, Task<HttpResponseMessage>> fetch, CancellationToken ct)
        where TFile : IUpstreamFile<TFile>
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var status = await snapshots.StatusAsync(source, key, ct);
        if (status?.RetryAfter > now)
        {
            log.LogInformation("{Source}/{Key}: a aguardar nova tentativa até {RetryAfter}", source, key, status.RetryAfter);
            return false;
        }

        Outcome outcome;
        string url = "";
        try
        {
            using var response = await fetch(ct);
            url = response.RequestMessage?.RequestUri?.ToString() ?? "";
            outcome = await ReadAsync<TFile>(response, now, ct);
        }
        catch (Exception e) when (e is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            // An OperationCanceledException that is not ours is the HttpClient timeout.
            outcome = new Outcome(null, e is OperationCanceledException ? "timeout" : e.Message, MinBackoff);
        }

        if (outcome.Body is null)
        {
            await snapshots.RecordAsync(source, key, now, outcome.Error, now + outcome.Backoff, ct);
            log.LogWarning("{Source}/{Key}: {Error}; próxima tentativa em {Backoff}", source, key, outcome.Error, outcome.Backoff);
            return false;
        }

        await snapshots.InsertAsync(source, key, now, outcome.Body, url, ct);
        await snapshots.RecordAsync(source, key, now, error: null, retryAfter: null, ct);
        log.LogInformation("{Source}/{Key}: novo snapshot ({Bytes} bytes)", source, key, outcome.Body.Length);
        return true;
    }

    /// <summary>Pure: a 2xx body that parses into <typeparamref name="TFile"/> and is usable, or the error and the backoff.</summary>
    public static async Task<Outcome> ReadAsync<TFile>(HttpResponseMessage response, DateTime now, CancellationToken ct)
        where TFile : IUpstreamFile<TFile>
    {
        if (!response.IsSuccessStatusCode)
        {
            return new Outcome(null, $"HTTP {(int)response.StatusCode}", BackoffFor(response, now));
        }

        var body = await response.Content.ReadAsStringAsync(ct);
        return IsUsable<TFile>(body) ? new Outcome(body, null, TimeSpan.Zero) : new Outcome(null, InvalidBody, MinBackoff);
    }

    /// <summary>Valid JSON, not an empty object or array, that parses into <typeparamref name="TFile"/> with the data the parsers need.</summary>
    public static bool IsUsable<TFile>(string body) where TFile : IUpstreamFile<TFile>
    {
        try
        {
            return HasContent(body) && TFile.Parse(body).IsUsable;
        }
        catch (Exception e) when (e is JsonException or InvalidOperationException or NotSupportedException)
        {
            return false;
        }
    }

    private static bool HasContent(string body)
    {
        using var document = JsonDocument.Parse(body);
        var root = document.RootElement;
        return root.ValueKind switch
        {
            JsonValueKind.Object => root.EnumerateObject().Any(),
            JsonValueKind.Array => root.GetArrayLength() > 0,
            _ => false,
        };
    }

    /// <summary>The minimum backoff, or a 429's Retry-After (seconds or a date) when that is longer.</summary>
    private static TimeSpan BackoffFor(HttpResponseMessage response, DateTime now)
    {
        if (response.StatusCode != HttpStatusCode.TooManyRequests || response.Headers.RetryAfter is not { } retryAfter)
        {
            return MinBackoff;
        }

        var wait = retryAfter.Delta ?? (retryAfter.Date is { } date ? date.UtcDateTime - now : TimeSpan.Zero);
        return wait > MinBackoff ? wait : MinBackoff;
    }
}
