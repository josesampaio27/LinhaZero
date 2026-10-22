namespace LinhaZero.Api.Models;

/// <summary>
/// One row of GET /api/v1/runs, the simulation history: what the list shows, read from the stored request and result
/// without sending either. <c>status</c> is queued, running, done or failed; the burned hectares are at the end of the
/// run and, with the buildings reached, null until it is done. <c>userName</c> is who started it.
/// </summary>
public sealed record RunSummary(
    Guid Id,
    string Status,
    DateTime CreatedAt,
    DateTime? FinishedAt,
    string? Error,
    string Grid,
    string? Title,
    int DurationMin,
    double WindDirectionDeg,
    double WindSpeedMs,
    int EnsembleRuns,
    int InterventionsA,
    int InterventionsB,
    string? VariantA,
    string? VariantB,
    string? Station,
    double? BurnedHaA,
    double? BurnedHaB,
    int? BuildingsA,
    int? BuildingsB,
    string? UserName);
