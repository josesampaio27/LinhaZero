using LinhaZero.Core.Geo;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;
using LinhaZero.Core.Weather.Ipma;
using LinhaZero.Core.Weather.OpenMeteo;

namespace LinhaZero.Core.Weather;

// Confirmed on the fixtures recorded 2026-10-17 12:44 UTC (services/Tests/fixtures):
// - observations.json keys are UTC hours ("2026-10-17T12:00" was the newest at 12:44 UTC; Merelim read 24.5 °C,
//   consistent with Open-Meteo's 20.3 °C at 576 m for the same UTC hour). Whole station-hour entries can be null
//   (721 of them) and any field can be -99.0 (missing).
// - idDireccVento codes 0..9 all occur: 0 = calm/no direction, 1 N, 2 NE, 3 E, 4 SE, 5 S, 6 SW, 7 W, 8 NW, 9 N.
// - warnings_www.json startTime/endTime have no offset and are UTC: a batch with startTime 12:09 was absent from the
//   file fetched at 12:25 UTC and present at 12:44 UTC; in Europe/Lisbon (UTC+1) it would have been 11:09 UTC.
// - distrits-islands.json latitude/longitude are strings; rcm-d0.json local.<dico>.{latitude,longitude} are numbers.
// - Open-Meteo with timezone=UTC: current.time and hourly.time have no offset; the first hourly entry is the current hour.

/// <summary>
/// Pure: builds the weather answer for a point from the saved snapshots. Each source is judged against its own
/// fetch time, never the clock, so an old recording gives the same answer as when it was recorded.
/// </summary>
public static class WeatherBuilder
{
    public const double MaxStationKm = 25;

    /// <summary>A station reading counts when it is at most this much older than the observations file.</summary>
    public static readonly TimeSpan MaxStationAge = TimeSpan.FromHours(2);

    /// <summary>The model's current wind counts when it is at most this much older than the forecast file.</summary>
    public static readonly TimeSpan MaxDataAge = TimeSpan.FromHours(3);
    /// <summary>Hours of forecast: enough for the longest simulation (8 h).</summary>
    public const int ForecastHours = 8;

    /// <summary>Below this speed the wind is calm and has no direction.</summary>
    public const double CalmMs = 0.25;

    private static readonly string[] RiskLabels = ["", "Reduzido", "Moderado", "Elevado", "Muito elevado", "Máximo"];

    public static WeatherResponse Build(GeoPoint point, WeatherSnapshots snapshots)
    {
        var (observed, air) = ObservedAt(point, snapshots.Stations, snapshots.Observations);
        var openMeteo = snapshots.OpenMeteo is { Data: { } forecast, FetchedAt: { } forecastAt }
            ? ParseOpenMeteo(forecast, forecastAt)
            : new OpenMeteoReading(null, []);
        var fireRisk = snapshots.FireRisk.Data is { } riskFile ? ParseRcm(riskFile, point) : null;
        var warningArea = snapshots.Districts.Data is { } districts ? WarningArea(districts, point) : null;
        var warnings = WarningsFor(warningArea, snapshots.Warnings);

        var use = ChooseWind(observed, openMeteo.Current);
        var windSource = use switch
        {
            "observed" => "IPMA observações",
            "model" => "Open-Meteo",
            _ => null,
        };
        List<SourceStatus> sources =
        [
            SourceStatus.From("IPMA estações", snapshots.Stations),
            SourceStatus.From("IPMA observações", snapshots.Observations),
            SourceStatus.From("Open-Meteo", snapshots.OpenMeteo),
            SourceStatus.From("IPMA risco de incêndio", snapshots.FireRisk),
            SourceStatus.From("IPMA avisos", snapshots.Warnings),
            SourceStatus.From("IPMA distritos", snapshots.Districts),
        ];

        return new WeatherResponse(
            new WeatherLocation(point.Lat, point.Lon),
            use,
            observed,
            air,
            openMeteo.Current,
            openMeteo.Forecast,
            fireRisk,
            warnings,
            warningArea,
            sources,
            windSource);
    }

    /// <summary>The station wins when it has wind; a calm station only wins when there is no model.</summary>
    private static string? ChooseWind(ObservedWind? observed, ModelWind? model)
    {
        if (observed is { SpeedMs: >= CalmMs })
        {
            return "observed";
        }

        if (model is not null)
        {
            return "model";
        }

        return observed is not null ? "observed" : null;
    }

    private static (ObservedWind? Wind, ObservedAir? Air) ObservedAt(
        GeoPoint point, Snapshot<IpmaStationsFile> stations, Snapshot<IpmaObservationsFile> observations)
    {
        if (stations.Data is null || observations.Data is null || observations.FetchedAt is not { } observedAt)
        {
            return (null, null);
        }

        return (PickWindStation(stations.Data, observations.Data, point, observedAt), PickAirStation(stations.Data, observations.Data, point, observedAt));
    }

    private static List<WeatherWarning> WarningsFor(string? area, Snapshot<IpmaWarningsFile> warnings)
    {
        if (area is null || warnings.Data is null || warnings.FetchedAt is not { } fetchedAt)
        {
            return [];
        }

        return ParseWarnings(warnings.Data, area, fetchedAt);
    }

    /// <summary>
    /// The wind of the nearest station within 25 km that measured a valid wind in the 2 h before <paramref name="asOf"/>,
    /// from its newest such hour. A station whose newest hour has no wind can still answer from the hour before.
    /// </summary>
    public static ObservedWind? PickWindStation(IpmaStationsFile stations, IpmaObservationsFile observations, GeoPoint point, DateTime asOf)
    {
        var found = NearestReading(stations, observations, point, asOf, observation =>
            observation.WindSpeedMs is { } speed && Direction(WindCode(observation), speed).Valid);
        if (found is null)
        {
            return null;
        }

        var (station, reading) = found.Value;
        var speed = reading.Observation.WindSpeedMs!.Value;
        var direction = Direction(WindCode(reading.Observation), speed);
        return new ObservedWind(direction.DegreesFrom, speed, reading.Hour, station);
    }

    /// <summary>
    /// The humidity and temperature of the nearest station within 25 km that measured either in the 2 h before
    /// <paramref name="asOf"/>, from its newest such hour.
    /// </summary>
    public static ObservedAir? PickAirStation(IpmaStationsFile stations, IpmaObservationsFile observations, GeoPoint point, DateTime asOf)
    {
        var found = NearestReading(stations, observations, point, asOf, observation =>
            observation.HumidityPct is not null || observation.TemperatureC is not null);
        if (found is null)
        {
            return null;
        }

        var (station, reading) = found.Value;
        return new ObservedAir(reading.Observation.HumidityPct, reading.Observation.TemperatureC, reading.Hour, station);
    }

    /// <summary>Stations by distance (within 25 km); the first whose readings of the last 2 h include a usable one, with its newest usable reading.</summary>
    private static (WeatherStation Station, IpmaStationReading Reading)? NearestReading(
        IpmaStationsFile stations, IpmaObservationsFile observations, GeoPoint point, DateTime asOf, Func<IpmaObservation, bool> usable)
    {
        var nearbyStations = stations.Stations
            .Where(station => station.Id is not null && station.Location is not null)
            .Select(station => (Station: station, DistanceKm: Distance.Km(point, station.Location!)))
            .Where(candidate => candidate.DistanceKm <= MaxStationKm)
            .OrderBy(candidate => candidate.DistanceKm);

        foreach (var (station, distanceKm) in nearbyStations)
        {
            var reading = observations.ReadingsSince(station.Id!.Value, asOf - MaxStationAge)
                .FirstOrDefault(candidate => usable(candidate.Observation));
            if (reading is not null)
            {
                return (new WeatherStation(station.Id.Value, station.Name, Math.Round(distanceKm, 1)), reading);
            }
        }

        return null;
    }

    private static int WindCode(IpmaObservation observation) => (int)(observation.WindDirectionCode ?? 0);

    /// <summary>IPMA code to degrees the wind blows from. Calm has no direction whatever the code; code 0 with wind is invalid.</summary>
    public static WindDirection Direction(int code, double speedMs)
    {
        if (speedMs < CalmMs)
        {
            return new WindDirection(true, null);
        }

        return code switch
        {
            >= 1 and <= 8 => new WindDirection(true, (code - 1) * 45.0),
            9 => new WindDirection(true, 0),
            _ => new WindDirection(false, null),
        };
    }

    /// <summary>The current wind, when at most 3 h older than <paramref name="asOf"/>, and the next six hours after it.</summary>
    public static OpenMeteoReading ParseOpenMeteo(OpenMeteoForecast forecast, DateTime asOf)
    {
        ModelWind? current = null;
        if (forecast.Current is { } now
            && UpstreamJson.ParseUtc(now.Time) is { } time
            && asOf - time <= MaxDataAge
            && now is { WindDirectionDeg: { } direction, WindSpeedMs: { } speed })
        {
            current = new ModelWind(direction, speed, now.WindGustsMs, now.HumidityPct, now.TemperatureC, time, now.CloudPct);
        }

        return new OpenMeteoReading(current, NextHours(forecast.Hourly, asOf));
    }

    private static List<ForecastHour> NextHours(OpenMeteoHourly? hourly, DateTime asOf)
    {
        var hours = new List<ForecastHour>();
        if (hourly is null)
        {
            return hours;
        }

        for (var i = 0; i < hourly.Time.Count && hours.Count < ForecastHours; i++)
        {
            var time = UpstreamJson.ParseUtc(hourly.Time[i]);
            var speed = hourly.WindSpeedMs.ElementAtOrDefault(i);
            var direction = hourly.WindDirectionDeg.ElementAtOrDefault(i);
            if (time is null || time <= asOf || speed is null || direction is null)
            {
                continue;
            }

            hours.Add(new ForecastHour(
                time.Value,
                direction.Value,
                speed.Value,
                hourly.HumidityPct.ElementAtOrDefault(i),
                hourly.TemperatureC.ElementAtOrDefault(i),
                hourly.CloudPct.ElementAtOrDefault(i)));
        }

        return hours;
    }

    /// <summary>The risk of the municipality whose centroid is nearest to the point; null when that level is not 1–5.</summary>
    public static FireRisk? ParseRcm(IpmaFireRiskFile file, GeoPoint point)
    {
        if (file.Municipalities.Count == 0)
        {
            return null;
        }

        var (code, nearest) = file.Municipalities.MinBy(municipality => Distance.Km(point, municipality.Value.Centroid));
        var level = nearest.Data?.Level ?? 0;
        if (level is < 1 or > 5)
        {
            return null;
        }

        return new FireRisk(level, RiskLabels[level], code, file.ForecastDate ?? "");
    }

    /// <summary>The warning area of the nearest mainland place. Limitation: wrong near district borders; district polygons would fix it.</summary>
    public static string? WarningArea(IpmaDistrictsFile districts, GeoPoint point) =>
        districts.Places
            .Where(place => place.Region == IpmaDistrictsFile.Mainland)
            .MinBy(place => Distance.Km(point, place.Location))
            ?.WarningArea;

    /// <summary>The yellow, orange and red warnings of the area that are still active and start within 24 h of <paramref name="asOf"/>.</summary>
    public static List<WeatherWarning> ParseWarnings(IpmaWarningsFile file, string area, DateTime asOf)
    {
        var horizon = asOf + TimeSpan.FromHours(24);
        var warnings = new List<WeatherWarning>();
        foreach (var warning in file.Warnings)
        {
            if (warning.Area != area || warning.Level == "green")
            {
                continue;
            }

            var start = UpstreamJson.ParseUtc(warning.Start) ?? DateTime.MinValue;
            var end = UpstreamJson.ParseUtc(warning.End) ?? DateTime.MinValue;
            if (end > asOf && start <= horizon)
            {
                warnings.Add(new WeatherWarning(warning.Type ?? "", warning.Level ?? "", start, end, warning.Text ?? ""));
            }
        }

        return warnings;
    }
}
