using System.Text.Json;

namespace LinhaZero.Api.Models;

/// <summary>
/// The GET /api/v1/runs/{id} body: one row of the runs table. <c>status</c> is queued, running, done or failed;
/// <c>progress</c> is the number of decisions done (0–2); <c>result</c> is the run-result contract once done.
/// </summary>
public sealed record RunStatusResponse(Guid Id, string Status, int Progress, string? Error, JsonElement? Result, DateTime CreatedAt, DateTime? StartedAt, DateTime? FinishedAt, string? Worker);
