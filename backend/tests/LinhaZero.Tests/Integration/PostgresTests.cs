using System.Text.Json;
using Microsoft.Extensions.Options;
using NATS.Client.Core;
using Npgsql;
using Xunit.Abstractions;

namespace LinhaZero.Tests;

/// <summary>
/// Run against the compose Postgres (and, for the SSE test, the compose NATS) when TEST_PG is set (an Npgsql connection string, or "1" to use PGHOST etc.).
/// Otherwise skipped with a visible message. Each test uses its own source name, so leftovers never collide.
/// </summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TEST_PG"))) Skip = "TEST_PG não definido: testes Postgres/NATS saltados (precisam do compose: npm run up, depois TEST_PG=1)";
    }
}

public class PostgresTests(ITestOutputHelper output)
{
    public static string ConnectionString =>
        Environment.GetEnvironmentVariable("TEST_PG") is { Length: > 1 } s ? s : Pg.ConnectionString();

    private static readonly NpgsqlDataSource Db = Pg.CreateDataSource(ConnectionString);
    private readonly SnapshotStore _snapshots = new(Db);
    private readonly string _source = "test-" + Guid.NewGuid().ToString("N")[..8];
    private static readonly DateTime T0 = new(2026, 10, 17, 12, 0, 0, DateTimeKind.Utc);

    [PostgresFact]
    public async Task Insert_then_read_the_latest()
    {
        output.WriteLine($"Postgres: {ConnectionString}");
        await _snapshots.InsertAsync(_source, "", T0, """{"a":1}""", "http://x");
        var newest = await _snapshots.InsertAsync(_source, "", T0.AddMinutes(10), """{"a":2}""", "http://x");
        var latest = await _snapshots.LatestAsync(_source, "");
        Assert.Equal(newest, latest!.Id);
        Assert.Equal(T0.AddMinutes(10), latest.FetchedAt);
        using (var body = JsonDocument.Parse(await _snapshots.BodyAsync(newest)))
        {
            Assert.Equal(2, body.RootElement.GetProperty("a").GetInt32());
        }
        Assert.Null(await _snapshots.LatestAsync(_source, "other-key"));
    }

    [PostgresFact]
    public async Task Retention_keeps_the_newest_row_per_source_and_key()
    {
        var old = DateTime.UtcNow.AddDays(-10);
        await _snapshots.InsertAsync(_source, "a", old, """{"n":1}""", "u");
        var keepA = await _snapshots.InsertAsync(_source, "a", old.AddHours(1), """{"n":2}""", "u");
        var keepB = await _snapshots.InsertAsync(_source, "b", old, """{"n":3}""", "u"); // the only row of its key, however old
        var fresh = await _snapshots.InsertAsync(_source, "c", DateTime.UtcNow, """{"n":4}""", "u");
        await _snapshots.RetainAsync(TimeSpan.FromDays(3));
        Assert.Equal(keepA, (await _snapshots.LatestAsync(_source, "a"))!.Id);
        Assert.Equal(keepB, (await _snapshots.LatestAsync(_source, "b"))!.Id);
        Assert.Equal(fresh, (await _snapshots.LatestAsync(_source, "c"))!.Id);
        await using var cmd = Db.CreateCommand("select count(*) from snapshots where source = $1");
        cmd.Parameters.Add(new() { Value = _source });
        Assert.Equal(3L, await cmd.ExecuteScalarAsync());
    }

    [PostgresFact]
    public async Task Status_makes_stale_true_when_the_newest_error_is_later_than_the_last_success()
    {
        var now = DateTime.UtcNow;
        await _snapshots.InsertAsync(SourceCatalog.FogosActive, _source, now, """{"success":true,"data":[]}""", "u");
        var reader = new SnapshotReader(_snapshots, Options.Create(new SourceOptions()));
        Task<Snapshot<FogosActiveFile>> Latest(DateTime at) => reader.LatestAsync<FogosActiveFile>(SourceCatalog.FogosActive, _source, at, default);

        await _snapshots.RecordAsync(SourceCatalog.FogosActive, _source, now, null, null);
        var ok = await Latest(now);
        Assert.False(ok.Stale);
        Assert.Null(ok.Error);

        await _snapshots.RecordAsync(SourceCatalog.FogosActive, _source, now.AddMinutes(2), "HTTP 429", now.AddHours(1));
        var failed = await Latest(now.AddMinutes(2));
        Assert.True(failed.Stale);
        Assert.Equal("HTTP 429", failed.Error);
        Assert.NotNull(failed.Data);
        var status = await _snapshots.StatusAsync(SourceCatalog.FogosActive, _source);
        Assert.Equal(now.AddHours(1), status!.RetryAfter!.Value, TimeSpan.FromMilliseconds(1));
        Assert.Equal(now, status.LastOkAt!.Value, TimeSpan.FromMilliseconds(1)); // kept through the failure

        // A later success clears the error; an old snapshot is stale by age alone (twice the 2 min interval).
        await _snapshots.RecordAsync(SourceCatalog.FogosActive, _source, now.AddMinutes(3), null, null);
        Assert.False((await Latest(now.AddMinutes(3))).Stale);
        Assert.True((await Latest(now.AddMinutes(5))).Stale);
    }

    [PostgresFact]
    public async Task Sse_delivers_events_that_arrive_after_a_ping()
    {
        // Compose NATS next to the compose Postgres; a 200 ms heartbeat so several pings pass before the events.
        await using var nats = new NatsConnection(new NatsOpts { Url = Environment.GetEnvironmentVariable("NATS_URL") ?? "nats://127.0.0.1:4222" });
        var runs = new RunEventStream(new RunRepository(Db), nats);
        var id = Guid.NewGuid();
        await using (var cmd = Db.CreateCommand("insert into runs (id, status, request) values ($1, 'queued', '{}')"))
        {
            cmd.Parameters.Add(new() { Value = id });
            await cmd.ExecuteNonQueryAsync();
        }
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var got = new List<string>();
        var publisher = Task.Run(async () =>
        {
            await Task.Delay(1200); // about 5 pings
            await nats.PublishAsync($"runs.{id}.events", """{"type":"progress","status":"running","done":0,"total":2}""");
            await Task.Delay(700);
            await nats.PublishAsync($"runs.{id}.events", """{"type":"progress","status":"running","done":1,"total":2}""");
            await nats.PublishAsync($"runs.{id}.events", """{"type":"progress","status":"running","done":2,"total":2}""");
            await nats.PublishAsync($"runs.{id}.events", """{"type":"done"}""");
        });
        await foreach (var item in runs.EventsAsync(id, cts.Token, TimeSpan.FromMilliseconds(200))) got.Add((item.EventType ?? "") + ":" + item.Data);
        await publisher;
        await using (var cmd = Db.CreateCommand("delete from runs where id = $1"))
        {
            cmd.Parameters.Add(new() { Value = id });
            await cmd.ExecuteNonQueryAsync();
        }
        output.WriteLine(string.Join(" ", got));
        var types = got.Select(e => e.Split(':')[0]).ToList();
        Assert.Equal("progress", types[0]);
        Assert.True(types.Count(e => e == "ping") >= 3, "expected several pings before the events");
        Assert.Equal(["progress", "progress", "progress", "done"], types.Where(e => e != "ping").Skip(1));
    }

    [PostgresFact]
    public async Task Exactly_one_leader_and_failover_within_one_period()
    {
        var period = TimeSpan.FromSeconds(1);
        // Its own lock name, so the test never competes with a running ingest.
        await using var a = new LeaderLock(ConnectionString, period, _source);
        await using var b = new LeaderLock(ConnectionString, period, _source);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var body = (CancellationToken ct) => Task.Delay(Timeout.Infinite, ct);
        var ra = a.RunAsync(body, cts.Token);
        await Task.Delay(500);
        var rb = b.RunAsync(body, cts.Token);
        await Task.Delay(1500);
        Assert.True(a.IsLeader);
        Assert.False(b.IsLeader);

        await a.DisposeAsync(); // drops the dedicated connection: the lock is released
        await ra;
        var t0 = DateTime.UtcNow;
        while (!b.IsLeader && DateTime.UtcNow - t0 < TimeSpan.FromSeconds(3)) await Task.Delay(50);
        output.WriteLine($"failover after {(DateTime.UtcNow - t0).TotalMilliseconds:F0} ms");
        Assert.True(b.IsLeader);
        Assert.False(a.IsLeader);
        cts.Cancel();
        await rb;
        Assert.False(b.IsLeader);
    }
}
