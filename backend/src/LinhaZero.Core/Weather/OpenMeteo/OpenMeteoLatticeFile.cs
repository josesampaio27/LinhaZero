using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather.OpenMeteo;

/// <summary>
/// One Open-Meteo answer for the whole lattice of a grid (see <c>Grids.Lattice</c>): a JSON array with one forecast
/// per point, each with its own coordinates. A single object is the old per-point shape and is rejected.
/// </summary>
public sealed class OpenMeteoLatticeFile : IUpstreamFile<OpenMeteoLatticeFile>
{
    public required List<OpenMeteoForecast> Points { get; init; }

    public bool IsUsable => Points.Count > 0 && Points.All(HasCurrentWind);

    public static OpenMeteoLatticeFile Parse(string json) => new() { Points = UpstreamJson.Deserialize<List<OpenMeteoForecast>>(json) };

    private static bool HasCurrentWind(OpenMeteoForecast point) =>
        point.Location is not null
        && point.Current is { WindSpeedMs: not null, WindDirectionDeg: not null }
        && UpstreamJson.ParseUtc(point.Current.Time) is not null;
}
