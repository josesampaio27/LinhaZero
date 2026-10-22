using System.Text.Json;
using Dapper;
using LinhaZero.Api.Models;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>All the SQL on the runs and run_rasters tables (infra/db/001_init.sql). The engine worker writes the rest of the row.</summary>
public sealed class RunRepository(NpgsqlDataSource db)
{
    /// <summary>The queued row. <paramref name="userId"/> is who started it (null for test sessions without a users row).</summary>
    public async Task InsertQueuedAsync(Guid id, string requestJson, Guid? userId, CancellationToken ct)
    {
        const string Sql = "insert into runs (id, status, request, user_id) values (@id, 'queued', @requestJson::jsonb, @userId)";
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, new { id, requestJson, userId }, cancellationToken: ct));
    }

    public async Task MarkFailedAsync(Guid id, string error, CancellationToken ct)
    {
        const string Sql = "update runs set status = 'failed', error = @error, finished_at = now() where id = @id";
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, new { id, error }, cancellationToken: ct));
    }

    public async Task<RunStatusResponse?> GetAsync(Guid id, CancellationToken ct)
    {
        const string Sql = """
            select id, status, progress, error, result::text as result_json, created_at, started_at, finished_at, worker
            from runs where id = @id
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        var row = await connection.QuerySingleOrDefaultAsync<RunRow>(new CommandDefinition(Sql, new { id }, cancellationToken: ct));
        return row?.ToResponse();
    }

    /// <summary>
    /// The simulation history, newest first: the runs of <paramref name="userId"/>, or everyone's when it is null. Only
    /// runs that carry the drawn scenario are listed; older ones cannot be opened as they were drawn (docs/decisoes/0073).
    /// </summary>
    public async Task<IReadOnlyList<RunSummary>> ListAsync(Guid? userId, int limit, CancellationToken ct)
    {
        const string Sql = """
            select r.id, r.status, r.created_at, r.finished_at, r.error,
                   r.request->>'grid' as grid,
                   r.request->'scenario'->>'title' as title,
                   (r.request->>'durationMin')::int as duration_min,
                   (r.request->'wind'->>'directionDeg')::float8 as wind_direction_deg,
                   (r.request->'wind'->>'speedMs')::float8 as wind_speed_ms,
                   (r.request->'ensemble'->>'runs')::int as ensemble_runs,
                   jsonb_array_length(r.request->'decisions'->'A') as interventions_a,
                   jsonb_array_length(r.request->'decisions'->'B') as interventions_b,
                   r.request->'variants'->'A'->>'name' as variant_a,
                   r.request->'variants'->'B'->>'name' as variant_b,
                   r.request->'weather'->>'station' as station,
                   (r.result->'A'->'metrics'->'burnedHaByHour'->>-1)::float8 as burned_ha_a,
                   (r.result->'B'->'metrics'->'burnedHaByHour'->>-1)::float8 as burned_ha_b,
                   (r.result->'A'->'metrics'->>'buildingsReached')::int as buildings_a,
                   (r.result->'B'->'metrics'->>'buildingsReached')::int as buildings_b,
                   u.name as user_name
            from runs r left join users u on u.id = r.user_id
            where r.request->'scenario' is not null and (@userId::uuid is null or r.user_id = @userId)
            order by r.created_at desc
            limit @limit
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return (await connection.QueryAsync<RunSummary>(new CommandDefinition(Sql, new { userId, limit }, cancellationToken: ct))).ToList();
    }

    /// <summary>
    /// The drawn scenario sent with a run (a saved-scenario file), as JSON text. Null when there is no such run, it has no
    /// scenario, or <paramref name="userId"/> is set and did not start it. The web sends it without the grid variants,
    /// which travel once in the request's own <c>variants</c> (the body is capped at 1 MB); they are put back here.
    /// </summary>
    public async Task<string?> ScenarioAsync(Guid id, Guid? userId, CancellationToken ct)
    {
        const string Sql = """
            select ((request->'scenario') || jsonb_build_object('variants',
                     case when jsonb_typeof(request->'variants') = 'object' then request->'variants'
                          else '{"A":null,"B":null}'::jsonb end))::text
            from runs
            where id = @id and request->'scenario' is not null and (@userId::uuid is null or user_id = @userId)
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<string?>(new CommandDefinition(Sql, new { id, userId }, cancellationToken: ct));
    }

    /// <summary>One result raster: little-endian Float32, rows × cols × 4 bytes. Null when the run or the layer does not exist.</summary>
    public async Task<byte[]?> RasterAsync(Guid id, string decision, string layer, CancellationToken ct)
    {
        const string Sql = "select data from run_rasters where run_id = @id and decision = @decision and layer = @layer";
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<byte[]?>(new CommandDefinition(Sql, new { id, decision, layer }, cancellationToken: ct));
    }

    /// <summary>The columns as Dapper reads them; the jsonb result comes as text and is parsed once here.</summary>
    private sealed record RunRow
    {
        public Guid Id { get; init; }

        public string Status { get; init; } = "";

        public int Progress { get; init; }

        public string? Error { get; init; }

        public string? ResultJson { get; init; }

        public DateTime CreatedAt { get; init; }

        public DateTime? StartedAt { get; init; }

        public DateTime? FinishedAt { get; init; }

        public string? Worker { get; init; }

        public RunStatusResponse ToResponse()
        {
            JsonElement? result = ResultJson is null ? null : JsonSerializer.Deserialize<JsonElement>(ResultJson);
            return new RunStatusResponse(Id, Status, Progress, Error, result, CreatedAt, StartedAt, FinishedAt, Worker);
        }
    }
}
