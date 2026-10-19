using LinhaZero.Core.Database;
using LinhaZero.Core.Grids;
using LinhaZero.Core.Sources;
using LinhaZero.Ingest.Clients;
using LinhaZero.Ingest.Services;
using LinhaZero.Ingest.Workers;
using Microsoft.Extensions.Options;
using Npgsql;

// Wiring only: the pull loops are in Workers/IngestWorker.cs, one pull in Services/Puller.cs, the HTTP calls in Clients/.
var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;
var services = builder.Services;

// Host
builder.Logging.ClearProviders().AddJsonConsole().AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.Logging.AddFilter("System.Net.Http.HttpClient", LogLevel.Warning); // one line per request is too much at 7 sources
if (config["ASPNETCORE_URLS"] is null)
{
    builder.WebHost.UseUrls("http://localhost:8081");
}

// Settings, from the environment variables the compose file sets (infra/README.md)
services.Configure<IngestOptions>(ingest =>
{
    ingest.Offline = config["INGEST_OFFLINE"] == "1";
    ingest.FogosApiKey = config["FOGOS_API_KEY"];
});
services.Configure<SourceOptions>(sources => sources.ReadFrom(config));
services.Configure<GridOptions>(grids => grids.Directory = config["GRIDS_DIR"] ?? grids.Directory);

// Infrastructure
services.AddSingleton(_ => Pg.CreateDataSource());
services.AddSingleton<SnapshotStore>();
services.AddSingleton(_ => new LeaderLock(Pg.ConnectionString(), period: TimeSpan.FromSeconds(30)));
services.AddSingleton<GridCatalog>();
services.AddSingleton(TimeProvider.System);

// Upstream HTTP clients: IPMA, Open-Meteo, fogos.pt (8 s timeout, User-Agent, no automatic retries: see UpstreamHttp)
services.AddUpstreamClients();

// The pull loops
services.AddSingleton<Puller>();
services.AddHostedService<IngestWorker>();

var app = builder.Build();
var offline = app.Services.GetRequiredService<IOptions<IngestOptions>>().Value.Offline;
var gridsDirectory = app.Services.GetRequiredService<GridCatalog>().Directory;
app.Logger.LogInformation("Ingestão a arrancar{Offline}; grelhas em {Grids}", offline ? " (offline: nunca contacta as fontes)" : "", gridsDirectory);

// Readiness for infra/smoke.sh: is this replica the leader, and does Postgres answer?
app.MapGet("/health/ready", async (NpgsqlDataSource db, LeaderLock leader, CancellationToken ct) =>
{
    try
    {
        await using var command = db.CreateCommand("select 1");
        await command.ExecuteScalarAsync(ct);
        return Results.Ok(new { leader = leader.IsLeader, postgres = "ok" });
    }
    catch (Exception e)
    {
        return Results.Json(new { leader = leader.IsLeader, postgres = e.Message }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.Run();
