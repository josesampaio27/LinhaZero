using System.Text.Json;
using Dapper;
using LinhaZero.Api.Models;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>All the SQL on the runs and run_rasters tables (infra/db/001_init.sql). The engine worker writes the rest of the row.</summary>
public sealed class RunRepository(NpgsqlDataSource db)
{
    public async Task InsertQueuedAsync(Guid id, string requestJson, CancellationToken ct)
    {
        const string Sql = "insert into runs (id, status, request) values (@id, 'queued', @requestJson::jsonb)";
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, new { id, requestJson }, cancellationToken: ct));
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
