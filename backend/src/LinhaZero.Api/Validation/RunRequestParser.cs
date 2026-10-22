using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using LinhaZero.Api.Models;
using LinhaZero.Core.Grids;

namespace LinhaZero.Api.Validation;

/// <summary>The body of POST /runs, read once: the JSON to forward to the worker, and the typed fields the API checks.</summary>
public sealed record ParsedRunRequest(JsonObject Json, RunRequest Request);

/// <summary>Strict parsing and validation of the run request. Every message is the Portuguese text of the 400.</summary>
public static class RunRequestParser
{
    public const int MaxRuns = 500;
    public const int MaxInterventions = 50;
    public const int MinDurationMin = 60;
    public const int MaxDurationMin = 1440; // 24 h: the replays of real fires run longer than the 8 h the UI offers
    public const string InvalidBody = "pedido inválido: JSON malformado, chave repetida ou campo obrigatório em falta";

    /// <summary>Required fields must be present, nulls only where the record allows them, and no key may appear twice.</summary>
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        RespectRequiredConstructorParameters = true,
        RespectNullableAnnotations = true,
        AllowDuplicateProperties = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private static readonly JsonDocumentOptions StrictDocument = new() { AllowDuplicateProperties = false };

    /// <summary>
    /// Throws <see cref="JsonException"/> on any shape problem, so nothing can fail later between saving the run and
    /// publishing the job.
    /// </summary>
    public static ParsedRunRequest Parse(string body)
    {
        try
        {
            var json = JsonNode.Parse(body, documentOptions: StrictDocument) as JsonObject
                ?? throw new JsonException("the body is not a JSON object");
            _ = json.Count; // JsonObject reads its properties lazily; reading them now surfaces any duplicate key here
            var request = json.Deserialize<RunRequest>(Json) ?? throw new JsonException("the body is null");
            return new ParsedRunRequest(json, request);
        }
        catch (Exception e) when (e is ArgumentException or InvalidOperationException or NotSupportedException)
        {
            throw new JsonException(e.Message, e);
        }
    }

    /// <summary>Null when the request is acceptable for <paramref name="grid"/>; otherwise the message for the 400.</summary>
    public static string? Validate(RunRequest request, GridHeader? grid) =>
        CheckNoNullEntries(request)
        ?? CheckGrid(request, grid)
        ?? CheckEnsemble(request.Ensemble)
        ?? CheckDurationAndWind(request)
        ?? CheckCells(request, grid!);

    // The JSON options do not reject nulls inside lists, so null interventions or cells are caught first.
    private static string? CheckNoNullEntries(RunRequest request)
    {
        foreach (var (name, interventions) in Decisions(request))
        {
            if (interventions.Any(intervention => intervention is null || intervention.Cells.Any(cell => cell is null)))
            {
                return $"a decisão {name} tem intervenções ou células nulas";
            }
        }

        return null;
    }

    private static string? CheckGrid(RunRequest request, GridHeader? grid) =>
        grid is null ? $"grelha \"{request.Grid}\" desconhecida" : null;

    // Range patterns are false for NaN, so non-finite numbers fail these checks too.
    private static string? CheckEnsemble(Ensemble ensemble)
    {
        if (ensemble.Runs is < 1 or > MaxRuns)
        {
            return $"ensemble.runs tem de estar entre 1 e {MaxRuns}";
        }

        if (ensemble.WindDirJitterDeg is not (>= 0 and <= 180))
        {
            return "ensemble.windDirJitterDeg tem de estar entre 0 e 180";
        }

        if (ensemble.WindSpeedJitterPct is not (>= 0 and <= 100))
        {
            return "ensemble.windSpeedJitterPct tem de estar entre 0 e 100";
        }

        return null;
    }

    private static string? CheckDurationAndWind(RunRequest request)
    {
        if (request.DurationMin is < MinDurationMin or > MaxDurationMin)
        {
            return $"durationMin tem de estar entre {MinDurationMin} e {MaxDurationMin}";
        }

        if (request.Wind.SpeedMs is not (>= 0 and <= 20))
        {
            return "wind.speedMs tem de estar entre 0 e 20";
        }

        if (request.Wind.DirectionDeg is not (>= 0 and <= 359))
        {
            return "wind.directionDeg tem de estar entre 0 e 359";
        }

        return null;
    }

    private static string? CheckCells(RunRequest request, GridHeader grid)
    {
        if (!IsInside(request.Ignition, grid))
        {
            return "a ignição está fora da grelha";
        }

        foreach (var (name, interventions) in Decisions(request))
        {
            if (interventions.Count > MaxInterventions)
            {
                return $"a decisão {name} tem mais de {MaxInterventions} intervenções";
            }

            foreach (var intervention in interventions)
            {
                if (CheckIntervention(intervention, name, grid) is { } error)
                {
                    return error;
                }
            }
        }

        return null;
    }

    private static string? CheckIntervention(InterventionCells intervention, string decision, GridHeader grid)
    {
        if (intervention.Cells.Count > grid.Rows * grid.Cols)
        {
            return $"uma intervenção da decisão {decision} tem mais células do que a grelha";
        }

        if (intervention.Cells.Any(cell => !IsInside(cell, grid)))
        {
            return $"uma intervenção da decisão {decision} tem células fora da grelha";
        }

        if (intervention.StartMin is not (>= 0 and <= MaxDurationMin))
        {
            return $"startMin de uma intervenção da decisão {decision} tem de estar entre 0 e {MaxDurationMin}";
        }

        if (intervention.RateFactor is { } rateFactor && rateFactor is not (>= 0 and <= 1))
        {
            return $"rateFactor de uma intervenção da decisão {decision} tem de estar entre 0 e 1";
        }

        if (intervention.EndMin is { } endMin && !(endMin > intervention.StartMin && endMin <= MaxDurationMin))
        {
            return $"endMin de uma intervenção da decisão {decision} tem de ser depois de startMin e no máximo {MaxDurationMin}";
        }

        if (intervention.LitCells is { } lit
            && (lit.Count > grid.Rows * grid.Cols || lit.Any(cell => cell is null || !IsInside(cell, grid))))
        {
            return $"litCells de uma intervenção da decisão {decision} tem células nulas ou fora da grelha";
        }

        if (intervention.Kind is not { } kind || !InterventionKinds.Contains(kind))
        {
            return $"uma intervenção da decisão {decision} tem um tipo desconhecido ({intervention.Kind ?? "em falta"})";
        }

        if (kind == "backfire" && intervention.LitCells is not { Count: > 0 })
        {
            return $"um contrafogo da decisão {decision} não tem litCells";
        }

        return null;
    }

    /// <summary>The intervention kinds the engine knows (engine/src/types.ts, INTERVENTION_KINDS).</summary>
    public static readonly IReadOnlySet<string> InterventionKinds =
        new HashSet<string>(["containmentLine", "suppression", "protectZone", "aerialDrop", "backfire"]);

    private static (string Name, List<InterventionCells> Interventions)[] Decisions(RunRequest request) =>
        [("A", request.Decisions.A), ("B", request.Decisions.B)];

    private static bool IsInside(Cell cell, GridHeader grid) =>
        cell.Row >= 0 && cell.Row < grid.Rows && cell.Col >= 0 && cell.Col < grid.Cols;
}
