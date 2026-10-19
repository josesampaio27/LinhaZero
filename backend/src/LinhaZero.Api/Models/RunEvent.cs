namespace LinhaZero.Api.Models;

/// <summary>
/// The run-event contract (contracts/examples/run-event-*.json): "progress" with status, done and total; "done"; or
/// "failed" with error. Nulls are not written, so "done" is <c>{"type":"done"}</c>.
/// </summary>
public sealed record RunEvent(string Type, string? Status = null, int? Done = null, int? Total = null, string? Error = null);
