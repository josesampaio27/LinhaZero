using LinhaZero.Core.Geo;
using LinhaZero.Core.Grids;
using LinhaZero.Core.Sources;
using LinhaZero.Core.Weather;
using LinhaZero.Core.Weather.Ipma;
using LinhaZero.Core.Weather.OpenMeteo;

namespace LinhaZero.Api.Services;

/// <summary>The weather for a point: the newest snapshot of each source, combined by <see cref="WeatherBuilder.Build"/>.</summary>
public sealed class WeatherService(SnapshotReader snapshots, GridCatalog grids)
{
    public async Task<WeatherResponse> GetAsync(GeoPoint point, CancellationToken ct)
    {
        var now = DateTime.UtcNow;

        // Started together, awaited one by one: the six reads run in parallel.
        var stations = snapshots.LatestAsync<IpmaStationsFile>(SourceCatalog.IpmaStations, "", now, ct);
        var observations = snapshots.LatestAsync<IpmaObservationsFile>(SourceCatalog.IpmaObservations, "", now, ct);
        var fireRisk = snapshots.LatestAsync<IpmaFireRiskFile>(SourceCatalog.IpmaRcm, "", now, ct);
        var warnings = snapshots.LatestAsync<IpmaWarningsFile>(SourceCatalog.IpmaWarnings, "", now, ct);
        var districts = snapshots.LatestAsync<IpmaDistrictsFile>(SourceCatalog.IpmaDistricts, "", now, ct);
        var openMeteo = NearestForecastAsync(point, now, ct);

        var inputs = new WeatherSnapshots(await stations, await observations, await fireRisk, await warnings, await districts, await openMeteo);
        return WeatherBuilder.Build(point, inputs);
    }

    /// <summary>
    /// The Open-Meteo snapshot is saved per grid and holds its whole lattice of points; the answer uses the point
    /// nearest to the request. Outside every grid there is no model.
    /// </summary>
    private async Task<Snapshot<OpenMeteoForecast>> NearestForecastAsync(GeoPoint point, DateTime now, CancellationToken ct)
    {
        var grid = Lattice.Domain(grids.All(), point);
        if (grid is null)
        {
            return Snapshot<OpenMeteoForecast>.Unavailable("fora de todas as zonas");
        }

        var lattice = await snapshots.LatestAsync<OpenMeteoLatticeFile>(SourceCatalog.OpenMeteo, grid.Name, now, ct);
        var nearest = lattice.Data is null ? null : Lattice.Nearest(lattice.Data.Points, point);
        return new Snapshot<OpenMeteoForecast>(nearest, lattice.FetchedAt, lattice.Stale, lattice.Error);
    }
}
