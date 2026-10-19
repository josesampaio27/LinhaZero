using System.Text.Json.Serialization;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather.Ipma;

/// <summary>distrits-islands.json: the places IPMA uses, each with its warning area. Coordinates come as strings.</summary>
public sealed class IpmaDistrictsFile : IUpstreamFile<IpmaDistrictsFile>
{
    /// <summary>idRegiao of mainland Portugal (2 and 3 are Madeira and the Azores).</summary>
    public const int Mainland = 1;

    [JsonPropertyName("data")]
    public List<IpmaPlace> Places { get; init; } = [];

    public bool IsUsable => Places.Any(place => place.Region == Mainland);

    public static IpmaDistrictsFile Parse(string json) => UpstreamJson.Deserialize<IpmaDistrictsFile>(json);
}

public sealed class IpmaPlace
{
    [JsonPropertyName("idRegiao")]
    public int Region { get; init; }

    [JsonPropertyName("idAreaAviso")]
    public string? WarningArea { get; init; }

    [JsonPropertyName("latitude")]
    public double Latitude { get; init; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; init; }

    [JsonIgnore]
    public GeoPoint Location => new(Latitude, Longitude);
}
