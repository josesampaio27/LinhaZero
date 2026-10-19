using LinhaZero.Api.Messaging;
using LinhaZero.Api.Models;
using Npgsql;

namespace LinhaZero.Api.Services;

/// <summary>Whether Postgres and NATS answer, and how many engine workers are idle.</summary>
public sealed class HealthService(NpgsqlDataSource db, RunQueue queue)
{
    public async Task<HealthResponse> CheckAsync(CancellationToken ct)
    {
        bool postgres;
        try
        {
            await using var cmd = db.CreateCommand("select 1");
            await cmd.ExecuteScalarAsync(ct);
            postgres = true;
        }
        catch (Exception)
        {
            postgres = false;
        }
        var nats = queue.IsConnected;
        var idle = nats ? await queue.IdleWorkersAsync(ct) : 0;
        return new(postgres, nats, idle);
    }
}
