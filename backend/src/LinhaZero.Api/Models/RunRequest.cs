using System.Text.Json;
using System.Text.Json.Serialization;
using LinhaZero.Api.OpenApi;

namespace LinhaZero.Api.Models;

// Only what the API validates of the run-request contract (contracts/README.md); the rest is passed through untouched.

/// <summary>A grid cell.</summary>
public sealed record Cell(int Row, int Col);

/// <summary>The wind: <c>directionDeg</c> 0–359 is where it blows from; <c>speedMs</c> 0–20.</summary>
public sealed record Wind(double DirectionDeg, double SpeedMs);

/// <summary>Paired ensemble options, shared by A and B: number of runs (1–500), wind jitter and seed.</summary>
public sealed record Ensemble(int Runs, double WindDirJitterDeg, double WindSpeedJitterPct, int Seed);

/// <summary>
/// One intervention, already rasterised into cells by the browser. <c>kind</c>: containmentLine, suppression, protectZone,
/// aerialDrop or backfire. <c>endMin</c>: when it stops acting (absent = never). <c>litCells</c>: the cells a backfire
/// sets alight (docs/decisoes/0070).
/// </summary>
[PassesUnknownFields] // "widthM"
public sealed record InterventionCells(
    List<Cell> Cells,
    double StartMin = 0,
    double? RateFactor = null,
    string? Kind = null,
    double? EndMin = null,
    List<Cell>? LitCells = null);

/// <summary>The interventions of decision A and of decision B (at most 50 each).</summary>
public sealed record Decisions(
    [property: JsonPropertyName("A")] List<InterventionCells> A,
    [property: JsonPropertyName("B")] List<InterventionCells> B);

/// <summary>
/// The POST /api/v1/runs body (contracts/examples/run-request.json). Fields the API does not read, such as
/// <c>variants</c>, are passed to the worker unchanged.
/// </summary>
[PassesUnknownFields] // "variants"
public sealed record RunRequest(string Grid, Cell Ignition, Wind Wind, int DurationMin, Ensemble Ensemble, Decisions Decisions, JsonElement? Weather = null);
