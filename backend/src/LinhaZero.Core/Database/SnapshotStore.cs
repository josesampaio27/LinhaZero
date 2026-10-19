using Dapper;
using Npgsql;

namespace LinhaZero.Core.Database;

/// <summary>
/// The snapshots and source_status tables (infra/db/001_init.sql): raw upstream bodies, never updated, and the last
/// pull attempt per (source, key).
/// </summary>
public sealed class SnapshotStore(NpgsqlDataSource db)
{
    public async Task<long> InsertAsync(string source, string key, DateTime fetchedAt, string body, string url, CancellationToken ct = default)
    {
        const string Sql = """
            insert into snapshots (source, key, fetched_at, body, url)
            values (@source, @key, @fetchedAt, @body::jsonb, @url)
            returning id
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<long>(new CommandDefinition(Sql, new { source, key, fetchedAt, body, url }, cancellationToken: ct));
    }

    /// <summary>Id and fetch time of the newest snapshot, without the body (served by the (source, key, fetched_at desc) index).</summary>
    public async Task<SnapshotRow?> LatestAsync(string source, string key, CancellationToken ct = default)
    {
        const string Sql = """
            select id, fetched_at from snapshots
            where source = @source and key = @key
            order by fetched_at desc, id desc
            limit 1
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.QuerySingleOrDefaultAsync<SnapshotRow>(new CommandDefinition(Sql, new { source, key }, cancellationToken: ct));
    }

    public async Task<string> BodyAsync(long id, CancellationToken ct = default)
    {
        const string Sql = "select body::text from snapshots where id = @id";
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.QuerySingleAsync<string>(new CommandDefinition(Sql, new { id }, cancellationToken: ct));
    }

    public async Task<SourceStatusRow?> StatusAsync(string source, string key, CancellationToken ct = default)
    {
        const string Sql = """
            select last_attempt_at, last_ok_at, last_error, retry_after from source_status
            where source = @source and key = @key
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.QuerySingleOrDefaultAsync<SourceStatusRow>(new CommandDefinition(Sql, new { source, key }, cancellationToken: ct));
    }

    /// <summary>
    /// Records one pull attempt. A success (no error) sets last_ok_at and clears the error; a failure keeps last_ok_at
    /// and sets the time before which no new attempt is made.
    /// </summary>
    public async Task RecordAsync(string source, string key, DateTime at, string? error, DateTime? retryAfter, CancellationToken ct = default)
    {
        const string Sql = """
            insert into source_status (source, key, last_attempt_at, last_ok_at, last_error, retry_after)
            values (@source, @key, @at, case when @error::text is null then @at end, @error, @retryAfter)
            on conflict (source, key) do update set
              last_attempt_at = excluded.last_attempt_at,
              last_ok_at = coalesce(excluded.last_ok_at, source_status.last_ok_at),
              last_error = excluded.last_error,
              retry_after = excluded.retry_after
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, new { source, key, at, error, retryAfter }, cancellationToken: ct));
    }

    /// <summary>Deletes snapshots older than <paramref name="keep"/>, always keeping the newest row per (source, key). Returns the rows deleted.</summary>
    public async Task<int> RetainAsync(TimeSpan keep, CancellationToken ct = default)
    {
        const string Sql = """
            delete from snapshots s
            where fetched_at < now() - make_interval(secs => @keepSeconds)
              and id <> (select id from snapshots n where n.source = s.source and n.key = s.key order by fetched_at desc, id desc limit 1)
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteAsync(new CommandDefinition(Sql, new { keepSeconds = keep.TotalSeconds }, cancellationToken: ct));
    }
}

public sealed record SnapshotRow
{
    public long Id { get; init; }

    public DateTime FetchedAt { get; init; }
}

public sealed record SourceStatusRow
{
    public DateTime? LastAttemptAt { get; init; }

    public DateTime? LastOkAt { get; init; }

    public string? LastError { get; init; }

    /// <summary>No new pull before this time (after a failure, or a 429's Retry-After).</summary>
    public DateTime? RetryAfter { get; init; }

    /// <summary>True when the newest attempt failed after the last success.</summary>
    public bool FailedSinceLastSuccess => LastError is not null && (LastOkAt is null || LastAttemptAt > LastOkAt);
}
