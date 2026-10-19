using System.Text.Json.Serialization;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather.Ipma;

/// <summary>rcm-d0.json: today's fire risk (RCM, 1–5) per municipality, keyed by municipality code (DICO).</summary>
public sealed class IpmaFireRiskFile : IUpstreamFile<IpmaFireRiskFile>
{
    [JsonPropertyName("dataPrev")]
    public string? ForecastDate { get; init; }

    [JsonPropertyName("local")]
    public Dictionary<string, IpmaMunicipalityRisk> Municipalities { get; init; } = [];

    public bool IsUsable => Municipalities.Count > 0;

    public static IpmaFireRiskFile Parse(string json) => UpstreamJson.Deserialize<IpmaFireRiskFile>(json);
}

public sealed class IpmaMunicipalityRisk
{
    [JsonPropertyName("data")]
    public IpmaRiskData? Data { get; init; }

    [JsonPropertyName("latitude")]
    public double Latitude { get; init; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; init; }

    [JsonIgnore]
    public GeoPoint Centroid => new(Latitude, Longitude);
}

public sealed class IpmaRiskData
{
    [JsonPropertyName("rcm")]
    public int? Level { get; init; }
}
