using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather;

/// <summary>The point that was asked for.</summary>
public sealed record WeatherLocation(double Lat, double Lon);

/// <summary>The IPMA station whose observation is used, and how far it is from the point.</summary>
public sealed record WeatherStation(long Id, string Name, double DistanceKm);

/// <summary>
/// Wind observed at the nearest IPMA station that measured wind in the last 2 h. <c>directionDeg</c> is where it blows
/// from; null when calm.
/// </summary>
public sealed record ObservedWind(double? DirectionDeg, double SpeedMs, DateTime ObservedAt, WeatherStation Station);

/// <summary>
/// Humidity and temperature at the nearest IPMA station that measured either in the last 2 h. Often a closer station
/// than the wind's: many stations have no anemometer.
/// </summary>
public sealed record ObservedAir(double? HumidityPct, double? TemperatureC, DateTime ObservedAt, WeatherStation Station);

/// <summary>Current wind from the Open-Meteo model at the nearest lattice point; cloud cover in % (fuel moisture).</summary>
public sealed record ModelWind(double DirectionDeg, double SpeedMs, double? GustMs, double? HumidityPct, double? TemperatureC, DateTime ObservedAt, double? CloudPct = null);

/// <summary>
/// One hour of the Open-Meteo forecast: wind, and the air (humidity, temperature, cloud cover in %) from which the
/// browser computes fuel moisture. The engine can follow these hours (weatherSteps) or use a single wind.
/// </summary>
public sealed record ForecastHour(DateTime Time, double DirectionDeg, double SpeedMs, double? HumidityPct, double? TemperatureC = null, double? CloudPct = null);

/// <summary>IPMA fire risk (1 Reduzido to 5 Máximo) for the municipality nearest to the point.</summary>
public sealed record FireRisk(int Level, string Label, string Municipality, string Date);

/// <summary>An IPMA yellow, orange or red warning for the point's warning area.</summary>
public sealed record WeatherWarning(string Type, string Level, DateTime Start, DateTime End, string Text);

/// <summary>
/// The GET /api/v1/weather body (contracts/examples/weather.json). <c>use</c> says which wind fills the form,
/// "observed" or "model"; it is null when neither source has a wind (the endpoint answers 503). <c>air</c> is the
/// humidity and temperature of the nearest station, whichever wind is used.
/// </summary>
public sealed record WeatherResponse(
    WeatherLocation Location,
    string? Use,
    ObservedWind? Observed,
    ObservedAir? Air,
    ModelWind? Model,
    List<ForecastHour> Forecast,
    FireRisk? FireRisk,
    List<WeatherWarning> Warnings,
    string? WarningArea,
    List<SourceStatus> Sources,
    string? WindSource);
