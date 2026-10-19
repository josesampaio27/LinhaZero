using System.Text.Json.Serialization;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather.Ipma;

/// <summary>stations.json: the IPMA weather stations, as a GeoJSON feature list.</summary>
public sealed class IpmaStationsFile : IUpstreamFile<IpmaStationsFile>
{
    public required List<IpmaStation> Stations { get; init; }

    public bool IsUsable => Stations.Count > 0 && Stations.All(station => station.Location is not null && station.Id is not null);

    public static IpmaStationsFile Parse(string json) => new() { Stations = UpstreamJson.Deserialize<List<IpmaStation>>(json) };
}

/// <summary>One feature: <c>{ "geometry": { "coordinates": [lon, lat] }, "properties": { "idEstacao", "localEstacao" } }</c>.</summary>
public sealed class IpmaStation
{
    [JsonPropertyName("geometry")]
    public IpmaGeometry? Geometry { get; init; }

    [JsonPropertyName("properties")]
    public IpmaStationProperties? Properties { get; init; }

    [JsonIgnore]
    public long? Id => Properties?.Id;

    [JsonIgnore]
    public string Name => Properties?.Name ?? "";

    /// <summary>GeoJSON puts longitude first.</summary>
    [JsonIgnore]
    public GeoPoint? Location => Geometry?.Coordinates is [var lon, var lat, ..] ? new GeoPoint(lat, lon) : null;
}

public sealed class IpmaGeometry
{
    [JsonPropertyName("coordinates")]
    public double[]? Coordinates { get; init; }
}

public sealed class IpmaStationProperties
{
    [JsonPropertyName("idEstacao")]
    public long? Id { get; init; }

    [JsonPropertyName("localEstacao")]
    public string? Name { get; init; }
}
