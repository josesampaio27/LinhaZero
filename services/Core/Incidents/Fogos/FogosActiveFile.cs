using System.Text.Json;
using System.Text.Json.Serialization;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Incidents.Fogos;

// Confirmed on one real response (2026-10-17 13:26 UTC, no key, fixtures/fogos-active.json): { "success": true,
// "data": [ { id, lat, lng, location ("Lisboa, Mafra, Santo Isidoro"), concelho, freguesia, status ("Em Curso",
// "Em Resolução", "Conclusão", ...), statusCode, natureza ("Mato", "Agrícola", "Povoamento Florestal"), naturezaCode,
// man, terrain, aerial, dateTime: { sec }, isFire: true, ... } ] }. familiaName and especieName were null.
// TODO(fogos-key): once the key arrives, confirm with a larger sample that non-rural incidents have isFire == false
// (the sample had only rural fires, so the filter in IncidentParser is unproven for the negative case).

/// <summary>GET /v2/incidents/active: <c>{ "success": true, "data": [...] }</c>, or the bare array.</summary>
public sealed class FogosActiveFile : IUpstreamFile<FogosActiveFile>
{
    public required List<FogosIncident> Incidents { get; init; }

    /// <summary>An empty list is a real answer: there are no active incidents.</summary>
    public bool IsUsable => true;

    public static FogosActiveFile Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var list = root.ValueKind == JsonValueKind.Object && root.TryGetProperty("data", out var data) ? data : root;
        if (list.ValueKind != JsonValueKind.Array)
        {
            throw new JsonException("fogos.pt: expected an array or { \"data\": [...] }");
        }

        return new FogosActiveFile { Incidents = UpstreamJson.Deserialize<List<FogosIncident>>(list) };
    }
}

/// <summary>One incident. Fields are read leniently: fogos.pt sends some numbers as strings and the id as either.</summary>
public sealed class FogosIncident
{
    [JsonPropertyName("id")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Id { get; init; }

    [JsonPropertyName("lat")]
    [JsonConverter(typeof(LenientNumberConverter))]
    public double? Lat { get; init; }

    [JsonPropertyName("lng")]
    [JsonConverter(typeof(LenientNumberConverter))]
    public double? Lon { get; init; }

    /// <summary>"District, Municipality, Parish".</summary>
    [JsonPropertyName("location")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Location { get; init; }

    [JsonPropertyName("concelho")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Municipality { get; init; }

    [JsonPropertyName("freguesia")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Parish { get; init; }

    [JsonPropertyName("status")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Status { get; init; }

    /// <summary>"Mato", "Agrícola", "Povoamento Florestal", ...</summary>
    [JsonPropertyName("natureza")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Nature { get; init; }

    [JsonPropertyName("isFire")]
    [JsonConverter(typeof(LenientBooleanConverter))]
    public bool? IsFire { get; init; }

    /// <summary>People on the ground.</summary>
    [JsonPropertyName("man")]
    [JsonConverter(typeof(LenientNumberConverter))]
    public double? People { get; init; }

    /// <summary>Land vehicles.</summary>
    [JsonPropertyName("terrain")]
    [JsonConverter(typeof(LenientNumberConverter))]
    public double? Vehicles { get; init; }

    [JsonPropertyName("aerial")]
    [JsonConverter(typeof(LenientNumberConverter))]
    public double? Aerial { get; init; }

    /// <summary>Start time as epoch seconds: <c>{ "sec": 1792233060 }</c>.</summary>
    [JsonPropertyName("dateTime")]
    public FogosEpoch? DateTime { get; init; }

    /// <summary>Start date in Lisbon local time, "17-10-2026" (used when dateTime is missing).</summary>
    [JsonPropertyName("date")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Date { get; init; }

    /// <summary>Start hour in Lisbon local time, "11:31".</summary>
    [JsonPropertyName("hour")]
    [JsonConverter(typeof(LenientStringConverter))]
    public string? Hour { get; init; }
}

public sealed class FogosEpoch
{
    [JsonPropertyName("sec")]
    [JsonConverter(typeof(LenientNumberConverter))]
    public double? Seconds { get; init; }
}
