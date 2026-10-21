using Dapper;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace LinhaZero.Tests;

/// <summary>
/// Database/Migrator.cs against the compose Postgres (TEST_PG). Each test works in its own schema (search_path), with
/// made-up scripts, so it never touches the real tables; the real scripts are checked for being embedded at all.
/// </summary>
public sealed class MigratorTests : IAsyncLifetime
{
    private readonly string _schema = "migr_" + Guid.NewGuid().ToString("N")[..8];
    private NpgsqlDataSource _db = null!;

    public async Task InitializeAsync()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TEST_PG"))) return;
        await using (var admin = NpgsqlDataSource.Create(PostgresTests.ConnectionString))
        {
            await admin.CreateCommand($"create schema {_schema}").ExecuteNonQueryAsync();
        }

        _db = NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder(PostgresTests.ConnectionString) { SearchPath = _schema }.ConnectionString);
    }

    public async Task DisposeAsync()
    {
        if (_db is null) return;
        await _db.DisposeAsync();
        await using var admin = NpgsqlDataSource.Create(PostgresTests.ConnectionString);
        await admin.CreateCommand($"drop schema {_schema} cascade").ExecuteNonQueryAsync();
    }

    private static readonly Migration[] Two =
    [
        new("001_a", "create table if not exists a (id int)"),
        new("002_b", "create table b (id int)"), // no "if not exists": would fail if run twice
    ];

    private Migrator For(IReadOnlyList<Migration> scripts) => new(_db, scripts, NullLogger.Instance);

    private async Task<List<string>> Recorded()
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<string>("select version from schema_migrations order by version")).ToList();
    }

    [Fact]
    public void The_real_scripts_are_embedded_in_order()
    {
        var versions = Migrator.Embedded().Select(m => m.Version).ToList();
        Assert.Contains("004_feedback", versions);
        Assert.Equal(versions.Order(StringComparer.Ordinal), versions);
    }

    [PostgresFact]
    public async Task Applies_what_is_missing_once()
    {
        Assert.Equal(["001_a", "002_b"], await For(Two).MigrateAsync(default));
        Assert.Empty(await For(Two).MigrateAsync(default));
        Assert.Equal(["001_a", "002_b"], await Recorded());
    }

    [PostgresFact]
    public async Task Only_new_scripts_run_later()
    {
        await For(Two[..1]).MigrateAsync(default);
        Assert.Equal(["002_b"], await For(Two).MigrateAsync(default));
    }

    [PostgresFact]
    public async Task Replicas_starting_together_apply_each_script_once()
    {
        var runs = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => For(Two).MigrateAsync(default)));
        Assert.Equal(2, runs.Sum(r => r.Count));
        Assert.Equal(["001_a", "002_b"], await Recorded());
    }

    [PostgresFact]
    public async Task A_failing_script_leaves_nothing_behind()
    {
        Migration[] broken = [Two[0], new("002_bad", "create tabel oops (id int)")];
        await Assert.ThrowsAsync<PostgresException>(() => For(broken).MigrateAsync(default));

        await using var c = await _db.OpenConnectionAsync();
        var tables = (await c.QueryAsync<string>("select table_name from information_schema.tables where table_schema = @_schema", new { _schema })).ToList();
        Assert.Empty(tables); // not a, and not even schema_migrations
    }
}
