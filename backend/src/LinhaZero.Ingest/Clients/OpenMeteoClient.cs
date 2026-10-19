using System.Globalization;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Weather;

namespace LinhaZero.Ingest.Clients;

/// <summary>The Open-Meteo forecast API (https://open-meteo.com), asked for several points in one request.</summary>
public sealed class OpenMeteoClient(HttpClient http)
{
    public static readonly Uri BaseAddress = new("https://api.open-meteo.com/");

    /// <summary>Current wind and the next hours for each point. The answer is a JSON array, one element per point.</summary>
    public Task<HttpResponseMessage> GetForecastAsync(IReadOnlyList<GeoPoint> points, CancellationToken ct) =>
        http.GetAsync(ForecastPath(points), ct);

    /// <summary>
    /// The request path: comma-separated coordinates with a dot decimal separator whatever the culture, wind in m/s,
    /// times in UTC, and one hour more than the forecast keeps (the first hourly entry is the current hour).
    /// </summary>
    public static string ForecastPath(IReadOnlyList<GeoPoint> points)
    {
        static string Join(IEnumerable<double> values) =>
            string.Join(',', values.Select(value => value.ToString("F4", CultureInfo.InvariantCulture)));

        return $"v1/forecast?latitude={Join(points.Select(p => p.Lat))}&longitude={Join(points.Select(p => p.Lon))}"
            + "&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,temperature_2m,cloud_cover"
            + "&hourly=wind_speed_10m,wind_direction_10m,relative_humidity_2m,temperature_2m,cloud_cover"
            + $"&wind_speed_unit=ms&timezone=UTC&forecast_hours={WeatherBuilder.ForecastHours + 1}";
    }
}
