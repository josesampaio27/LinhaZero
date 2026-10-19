using LinhaZero.Core.Sources;
using LinhaZero.Core.Weather.Ipma;
using LinhaZero.Core.Weather.OpenMeteo;

namespace LinhaZero.Core.Weather;

/// <summary>The six snapshots the weather answer is built from. <see cref="OpenMeteo"/> is the lattice point nearest to the request.</summary>
public sealed record WeatherSnapshots(
    Snapshot<IpmaStationsFile> Stations,
    Snapshot<IpmaObservationsFile> Observations,
    Snapshot<IpmaFireRiskFile> FireRisk,
    Snapshot<IpmaWarningsFile> Warnings,
    Snapshot<IpmaDistrictsFile> Districts,
    Snapshot<OpenMeteoForecast> OpenMeteo)
{
    public static WeatherSnapshots AllMissing { get; } = new(
        Snapshot<IpmaStationsFile>.Missing,
        Snapshot<IpmaObservationsFile>.Missing,
        Snapshot<IpmaFireRiskFile>.Missing,
        Snapshot<IpmaWarningsFile>.Missing,
        Snapshot<IpmaDistrictsFile>.Missing,
        Snapshot<OpenMeteoForecast>.Missing);
}

/// <summary>An IPMA direction code read as degrees. <see cref="DegreesFrom"/> is null when calm; <see cref="Valid"/> is false for code 0 with wind.</summary>
public sealed record WindDirection(bool Valid, double? DegreesFrom);

/// <summary>What one Open-Meteo point says: the current wind (null when too old) and the next hours.</summary>
public sealed record OpenMeteoReading(ModelWind? Current, List<ForecastHour> Forecast);
