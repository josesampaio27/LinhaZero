using System.Text.Json;
using LinhaZero.Api.Auth;
using LinhaZero.Api.Models;
using LinhaZero.Api.OpenApi;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace LinhaZero.Api.Controllers;

/// <summary>
/// The assistant (docs/decisoes/0079): Claude, reached through this API so the Anthropic key never leaves the server.
/// The browser's Anthropic SDK uses <c>/api/v1/assistant</c> as its base address and posts to <c>v1/messages</c> here.
/// Signed-in users only, each with a daily spending limit.
/// </summary>
[ApiController]
[Route("api/v1/assistant")]
public sealed class AssistantController(
    AssistantProxy proxy,
    AssistantUsageRepository usage,
    IOptions<AssistantOptions> options) : ControllerBase
{
    /// <summary>Messages per conversation; well past what a session in the panel reaches before it starts a new one.</summary>
    public const int MaxMessages = 400;

    /// <summary>Whether the assistant is on, and what the signed-in user spent today against their limit.</summary>
    [HttpGet("status")]
    [ProducesResponseType<AssistantStatus>(StatusCodes.Status200OK)]
    public async Task<AssistantStatus> Status(CancellationToken ct)
    {
        var settings = options.Value;
        var spent = settings.Enabled && AuthSetup.UserId(User) is { } userId ? await usage.SpentTodayAsync(userId, ct) : 0m;
        return new AssistantStatus(settings.Enabled, settings.Model, spent, settings.DailyBudgetUsd);
    }

    /// <summary>
    /// One turn of the conversation, streamed as Server-Sent Events in the Anthropic Messages API format. Only
    /// <c>messages</c> is read from the body; the server sets the model, system prompt, tools and limits.
    /// </summary>
    /// <remarks>At most ASSISTANT_REQUESTS_PER_HOUR per user, and ASSISTANT_DAILY_BUDGET_USD of spending per day.</remarks>
    [HttpPost("v1/messages")]
    [RawJsonBody(typeof(AssistantRequest))]
    [EnableRateLimiting(AuthSetup.AssistantLimit)]
    [ProducesResponseType<string>(StatusCodes.Status200OK, "text/event-stream")]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Messages(CancellationToken ct)
    {
        var settings = options.Value;
        if (!settings.Enabled)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ErrorResponse("O assistente não está ativo neste servidor."));
        }

        // The daily limit is per person, so the session must have a users row (only test sessions don't).
        if (AuthSetup.UserId(User) is not { } userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse("Sessão sem utilizador."));
        }

        var (messages, error) = await ReadMessagesAsync(ct);
        if (messages is null)
        {
            return BadRequest(new ErrorResponse(error!));
        }

        if (await usage.SpentTodayAsync(userId, ct) >= settings.DailyBudgetUsd)
        {
            return StatusCode(
                StatusCodes.Status429TooManyRequests,
                new ErrorResponse("Atingiu o limite diário do assistente. Volta a ficar disponível amanhã."));
        }

        var failure = await proxy.ForwardAsync(userId, messages, Response, ct);
        return failure is null ? new EmptyResult() : StatusCode(failure.Status, new ErrorResponse(failure.Message));
    }

    /// <summary>The conversation from the body: a non-empty list of user and assistant messages, nothing else.</summary>
    private async Task<(IReadOnlyList<JsonElement>? Messages, string? Error)> ReadMessagesAsync(CancellationToken ct)
    {
        AssistantRequest? body;
        try
        {
            body = await JsonSerializer.DeserializeAsync<AssistantRequest>(Request.Body, JsonSerializerOptions.Web, ct);
        }
        catch (JsonException)
        {
            return (null, "Pedido inválido: JSON malformado.");
        }

        if (body?.Messages is not { Count: > 0 } messages)
        {
            return (null, "Pedido inválido: a conversa está vazia.");
        }

        if (messages.Count > MaxMessages)
        {
            return (null, "A conversa ficou demasiado longa. Comece uma nova conversa.");
        }

        // System messages carry operator instructions: only the server's prompt may give them.
        foreach (var message in messages)
        {
            var role = message.ValueKind == JsonValueKind.Object
                && message.TryGetProperty("role", out var value)
                && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
            if (role is not ("user" or "assistant"))
            {
                return (null, "Pedido inválido: cada mensagem tem de ser do utilizador ou do assistente.");
            }
        }

        return (messages, null);
    }
}
