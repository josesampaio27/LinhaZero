using System.Globalization;
using System.Text.Json.Serialization;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather.Ipma;

/// <summary>
/// observations.json: the last 24 hours of every station, keyed by UTC hour ("2026-10-17T12:00") and then by station id.
/// A whole station-hour can be null, and any reading can be -99 (missing).
/// </summary>
public sealed class IpmaObservationsFile : IUpstreamFile<IpmaObservationsFile>
{
    public required Dictionary<string, Dictionary<string, IpmaObservation?>?> Hours { get; init; }

    public bool IsUsable => Hours.Values.Any(stations => stations is not null);

    public static IpmaObservationsFile Parse(string json) =>
        new() { Hours = UpstreamJson.Deserialize<Dictionary<string, Dictionary<string, IpmaObservation?>?>>(json) };

    /// <summary>The station's readings from <paramref name="since"/> on, newest first (hours it did not report are left out).</summary>
    public IEnumerable<IpmaStationReading> ReadingsSince(long stationId, DateTime since)
    {
        var id = stationId.ToString(CultureInfo.InvariantCulture);
        var readings = new List<IpmaStationReading>();
        foreach (var (hourText, stations) in Hours)
        {
            if (UpstreamJson.ParseUtc(hourText) is not { } hour || hour < since || stations is null)
            {
                continue;
            }

            if (stations.TryGetValue(id, out var observation) && observation is not null)
            {
                readings.Add(new IpmaStationReading(hour, observation));
            }
        }

        return readings.OrderByDescending(reading => reading.Hour);
    }
}

/// <summary>One station's entry for one hour.</summary>
public sealed record IpmaStationReading(DateTime Hour, IpmaObservation Observation);

/// <summary>One station-hour. Readings of -99 are read as null.</summary>
public sealed class IpmaObservation
{
    /// <summary>Wind speed, m/s.</summary>
    [JsonPropertyName("intensidadeVento")]
    [JsonConverter(typeof(IpmaReadingConverter))]
    public double? WindSpeedMs { get; init; }

    /// <summary>Wind direction code: 0 calm/none, 1 N, 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W, 8 NW, 9 N.</summary>
    [JsonPropertyName("idDireccVento")]
    [JsonConverter(typeof(IpmaReadingConverter))]
    public double? WindDirectionCode { get; init; }

    [JsonPropertyName("humidade")]
    [JsonConverter(typeof(IpmaReadingConverter))]
    public double? HumidityPct { get; init; }

    [JsonPropertyName("temperatura")]
    [JsonConverter(typeof(IpmaReadingConverter))]
    public double? TemperatureC { get; init; }
}
