using Npgsql;

namespace LinhaZero.Core.Database;

/// <summary>
/// Singleton election on a Postgres advisory lock held by one dedicated, unpooled connection for the life of the process.
/// (A pooled connection would lose the lock: Npgsql resets returned connections with DISCARD ALL, which releases advisory locks.)
/// </summary>
public sealed class LeaderLock(string connectionString, TimeSpan period, string name = LeaderLock.Name) : IAsyncDisposable
{
    public const string Name = "linha-zero-ingest";
    private readonly CancellationTokenSource _stop = new();
    private NpgsqlConnection? _conn;

    private volatile bool _isLeader;
    public bool IsLeader => _isLeader;

    /// <summary>
    /// Runs <paramref name="body"/> every time this process becomes leader, with a token that is cancelled when leadership is
    /// lost (the probe on the dedicated connection fails). Not the leader: retries every period.
    /// </summary>
    public async Task RunAsync(Func<CancellationToken, Task> body, CancellationToken ct)
    {
        using var all = CancellationTokenSource.CreateLinkedTokenSource(ct, _stop.Token);
        while (!all.IsCancellationRequested)
        {
            try
            {
                if (!await TryAcquireAsync(all.Token))
                {
                    await Task.Delay(period, all.Token);
                    continue;
                }
                _isLeader = true;
                using var lost = CancellationTokenSource.CreateLinkedTokenSource(all.Token);
                var probe = ProbeAsync(lost);
                try
                {
                    await body(lost.Token);
                }
                finally
                {
                    lost.Cancel();
                    await probe;
                    _isLeader = false;
                    await CloseAsync();
                }
            }
            catch (OperationCanceledException) when (all.IsCancellationRequested)
            {
                break;
            }
            catch (NpgsqlException)
            {
                // Postgres unreachable: back to retrying.
                await CloseAsync();
                try { await Task.Delay(period, all.Token); } catch (OperationCanceledException) { break; }
            }
        }
    }

    private async Task<bool> TryAcquireAsync(CancellationToken ct)
    {
        _conn = new NpgsqlConnection(connectionString + ";Pooling=false;Keepalive=30");
        await _conn.OpenAsync(ct);
        await using var cmd = new NpgsqlCommand("select pg_try_advisory_lock(hashtext($1))", _conn);
        cmd.Parameters.Add(new() { Value = name });
        if ((bool)(await cmd.ExecuteScalarAsync(ct))!) return true;
        await CloseAsync();
        return false;
    }

    // `select 1` on the lock's connection every period; any failure means the lock is gone.
    private async Task ProbeAsync(CancellationTokenSource lost)
    {
        try
        {
            using var timer = new PeriodicTimer(period);
            while (await timer.WaitForNextTickAsync(lost.Token))
            {
                await using var cmd = new NpgsqlCommand("select 1", _conn);
                await cmd.ExecuteScalarAsync(lost.Token);
            }
        }
        catch (Exception)
        {
            lost.Cancel();
        }
    }

    private async Task CloseAsync()
    {
        if (_conn is { } c)
        {
            _conn = null;
            try { await c.DisposeAsync(); } catch (Exception) { /* already broken */ }
        }
    }

    /// <summary>Stops the loop and drops the connection, which releases the lock at once. Safe to call twice.</summary>
    public async ValueTask DisposeAsync()
    {
        _stop.Cancel();
        await CloseAsync();
    }
}
