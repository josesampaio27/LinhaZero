using System.Text.Json.Serialization;
using LinhaZero.Core.Geo;

namespace LinhaZero.Core.Weather.OpenMeteo;

/// <summary>
/// The Open-Meteo answer for one point (requested with timezone=UTC and wind in m/s): the current values and the
/// next hours. Times have no offset and are UTC; the first hourly entry is the current hour.
/// </summary>
public sealed class OpenMeteoForecast
{
    [JsonPropertyName("latitude")]
    public double? Latitude { get; init; }

    [JsonPropertyName("longitude")]
    public double? Longitude { get; init; }

    [JsonPropertyName("current")]
    public OpenMeteoCurrent? Current { get; init; }

    [JsonPropertyName("hourly")]
    public OpenMeteoHourly? Hourly { get; init; }

    [JsonIgnore]
    public GeoPoint? Location => Latitude is { } lat && Longitude is { } lon ? new GeoPoint(lat, lon) : null;
}

public sealed class OpenMeteoCurrent
{
    [JsonPropertyName("time")]
    public string? Time { get; init; }

    [JsonPropertyName("wind_speed_10m")]
    public double? WindSpeedMs { get; init; }

    [JsonPropertyName("wind_direction_10m")]
    public double? WindDirectionDeg { get; init; }

    [JsonPropertyName("wind_gusts_10m")]
    public double? WindGustsMs { get; init; }

    [JsonPropertyName("relative_humidity_2m")]
    public double? HumidityPct { get; init; }

    [JsonPropertyName("temperature_2m")]
    public double? TemperatureC { get; init; }

    [JsonPropertyName("cloud_cover")]
    public double? CloudPct { get; init; }
}

/// <summary>Parallel arrays, one entry per hour.</summary>
public sealed class OpenMeteoHourly
{
    [JsonPropertyName("time")]
    public List<string?> Time { get; init; } = [];

    [JsonPropertyName("wind_speed_10m")]
    public List<double?> WindSpeedMs { get; init; } = [];

    [JsonPropertyName("wind_direction_10m")]
    public List<double?> WindDirectionDeg { get; init; } = [];

    [JsonPropertyName("relative_humidity_2m")]
    public List<double?> HumidityPct { get; init; } = [];

    [JsonPropertyName("temperature_2m")]
    public List<double?> TemperatureC { get; init; } = [];

    [JsonPropertyName("cloud_cover")]
    public List<double?> CloudPct { get; init; } = [];
}
