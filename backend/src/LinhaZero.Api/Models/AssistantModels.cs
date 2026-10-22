using System.Text.Json;
using LinhaZero.Api.OpenApi;

namespace LinhaZero.Api.Models;

/// <summary>
/// The body of POST /api/v1/assistant/v1/messages: an Anthropic Messages API request, as the browser's Anthropic SDK
/// sends it. Only <c>messages</c> is read (the conversation so far, in the Messages API format); the model, system
/// prompt, tools and limits are the server's, so the other fields the SDK sends are ignored.
/// </summary>
[PassesUnknownFields]
public sealed record AssistantRequest(IReadOnlyList<JsonElement>? Messages);

/// <summary>
/// The GET /api/v1/assistant/status body: whether the assistant is on (the server has an Anthropic key), its model,
/// and what the signed-in user spent today (Lisbon time) against their daily limit, in US dollars.
/// </summary>
public sealed record AssistantStatus(bool Enabled, string Model, decimal UsedTodayUsd, decimal DailyBudgetUsd);
