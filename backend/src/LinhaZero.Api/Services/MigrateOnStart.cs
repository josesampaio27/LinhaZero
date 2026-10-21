using LinhaZero.Core.Database;
using Npgsql;

namespace LinhaZero.Api.Services;

/// <summary>
/// Brings the schema up to date before the API serves anything (docs/decisoes/0065). Hosted services start before the
/// server listens, so a failed migration stops the process: the new pod never gets ready and the old ones keep serving.
/// While Postgres itself is still starting, it waits up to <see cref="MaxWait"/>.
/// </summary>
public sealed class MigrateOnStart(NpgsqlDataSource db, ILogger<MigrateOnStart> log) : IHostedService
{
    private static readonly TimeSpan MaxWait = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan Retry = TimeSpan.FromSeconds(3);

    public async Task StartAsync(CancellationToken ct)
    {
        var migrator = new Migrator(db, Migrator.Embedded(), log);
        var deadline = DateTime.UtcNow + MaxWait;
        while (true)
        {
            try
            {
                var applied = await migrator.MigrateAsync(ct);
                if (applied.Count == 0)
                {
                    log.LogInformation("Esquema da base de dados em dia");
                }

                return;
            }
            // Can't reach Postgres yet: try again. A failing script (PostgresException) is not transient and stops here.
            catch (NpgsqlException e) when (e is not PostgresException && DateTime.UtcNow < deadline)
            {
                log.LogWarning("Postgres ainda não responde ({Error}); nova tentativa em {Retry}s", e.Message, Retry.TotalSeconds);
                await Task.Delay(Retry, ct);
            }
        }
    }

    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;
}
