using LinhaZero.Core.Database;
using LinhaZero.Core.Grids;
using LinhaZero.Core.Incidents.Fogos;
using LinhaZero.Core.Sources;
using LinhaZero.Core.Weather.Ipma;
using LinhaZero.Core.Weather.OpenMeteo;
using LinhaZero.Ingest.Clients;
using LinhaZero.Ingest.Services;
using Microsoft.Extensions.Options;

namespace LinhaZero.Ingest.Workers;

/// <summary>
/// Waits to become the leader (only one ingest pulls at a time), then runs one pull loop per source, so a slow source
/// never delays another, plus an hourly clean-up of old snapshots.
/// </summary>
public sealed class IngestWorker(
    LeaderLock leader,
    SnapshotStore snapshots,
    Puller puller,
    IpmaClient ipma,
    OpenMeteoClient openMeteo,
    FogosClient fogos,
    GridCatalog grids,
    IOptions<IngestOptions> ingestOptions,
    IOptions<SourceOptions> sourceOptions,
    ILogger<IngestWorker> log) : BackgroundService
{
    /// <summary>Snapshots are never updated, so the table is the history; 3 days is enough for a laptop.</summary>
    private static readonly TimeSpan Keep = TimeSpan.FromDays(3);

    private bool Offline => ingestOptions.Value.Offline;

    protected override Task ExecuteAsync(CancellationToken ct) => leader.RunAsync(RunAsLeaderAsync, ct);

    private async Task RunAsLeaderAsync(CancellationToken ct)
    {
        log.LogInformation("Líder da ingestão{Offline}", Offline ? " (offline: sem recolha)" : "");
        var loops = SourceCatalog.All.Select(source => PullLoopAsync(source, ct)).Append(CleanUpLoopAsync(ct));
        try
        {
            await Task.WhenAll(loops);
        }
        catch (OperationCanceledException)
        {
            // Leadership lost or shutdown: the leader lock decides what happens next.
        }

        log.LogWarning("Liderança perdida ou paragem pedida");
    }

    /// <summary>On becoming leader, pulls a source at once if its newest snapshot is older than its interval; then on every tick.</summary>
    private async Task PullLoopAsync(string source, CancellationToken ct)
    {
        var interval = sourceOptions.Value.Interval(source);
        await PullOnceAsync(source, onlyIfOlderThan: interval, ct);

        using var timer = new PeriodicTimer(interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            await PullOnceAsync(source, onlyIfOlderThan: null, ct);
        }
    }

    /// <summary>One tick. A failed tick (Postgres restarting, a half-written index.json, ...) is logged and never ends the loop.</summary>
    private async Task PullOnceAsync(string source, TimeSpan? onlyIfOlderThan, CancellationToken ct)
    {
        if (Offline)
        {
            return;
        }

        try
        {
            await PullSourceAsync(source, onlyIfOlderThan, ct);
        }
        catch (Exception e) when (!ct.IsCancellationRequested)
        {
            log.LogError(e, "Ciclo de {Source} falhou nesta volta", source);
        }
    }

    private Task PullSourceAsync(string source, TimeSpan? onlyIfOlderThan, CancellationToken ct) => source switch
    {
        SourceCatalog.IpmaStations => PullAsync<IpmaStationsFile>(source, "", ipma.GetStationsAsync, onlyIfOlderThan, ct),
        SourceCatalog.IpmaObservations => PullAsync<IpmaObservationsFile>(source, "", ipma.GetObservationsAsync, onlyIfOlderThan, ct),
        SourceCatalog.IpmaRcm => PullAsync<IpmaFireRiskFile>(source, "", ipma.GetFireRiskAsync, onlyIfOlderThan, ct),
        SourceCatalog.IpmaWarnings => PullAsync<IpmaWarningsFile>(source, "", ipma.GetWarningsAsync, onlyIfOlderThan, ct),
        SourceCatalog.IpmaDistricts => PullAsync<IpmaDistrictsFile>(source, "", ipma.GetDistrictsAsync, onlyIfOlderThan, ct),
        SourceCatalog.FogosActive => PullAsync<FogosActiveFile>(source, "", fogos.GetActiveIncidentsAsync, onlyIfOlderThan, ct),
        SourceCatalog.OpenMeteo => PullOpenMeteoAsync(onlyIfOlderThan, ct),
        _ => throw new ArgumentOutOfRangeException(nameof(source), source, "unknown source"),
    };

    /// <summary>One Open-Meteo request per grid, for that grid's lattice of points; the snapshot key is the grid name.</summary>
    private async Task PullOpenMeteoAsync(TimeSpan? onlyIfOlderThan, CancellationToken ct)
    {
        foreach (var grid in grids.All())
        {
            var points = Lattice.Points(grid);
            await PullAsync<OpenMeteoLatticeFile>(
                SourceCatalog.OpenMeteo, grid.Name, token => openMeteo.GetForecastAsync(points, token), onlyIfOlderThan, ct);
        }
    }

    private async Task PullAsync<TFile>(
        string source, string key, Func<CancellationToken, Task<HttpResponseMessage>> fetch, TimeSpan? onlyIfOlderThan, CancellationToken ct)
        where TFile : IUpstreamFile<TFile>
    {
        if (onlyIfOlderThan is { } maxAge && await snapshots.LatestAsync(source, key, ct) is { } latest && DateTime.UtcNow - latest.FetchedAt <= maxAge)
        {
            return;
        }

        await puller.PullAsync<TFile>(source, key, fetch, ct);
    }

    private async Task CleanUpLoopAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        while (await timer.WaitForNextTickAsync(ct))
        {
            try
            {
                var deleted = await snapshots.RetainAsync(Keep, ct);
                if (deleted > 0)
                {
                    log.LogInformation("Retenção: {Rows} snapshots apagados", deleted);
                }
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                log.LogError(e, "Retenção falhou");
            }
        }
    }
}
