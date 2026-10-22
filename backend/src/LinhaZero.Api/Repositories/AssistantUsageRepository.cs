using Dapper;
using LinhaZero.Api.Services;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>The SQL on the assistant_usage table (backend/src/LinhaZero.Core/Database/Migrations/007_assistant_usage.sql).</summary>
public sealed class AssistantUsageRepository(NpgsqlDataSource db)
{
    public async Task InsertAsync(Guid userId, string model, AssistantUsage usage, decimal costUsd, CancellationToken ct)
    {
        const string Sql = """
            insert into assistant_usage (user_id, model, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, cost_usd)
            values (@userId, @model, @InputTokens, @CacheWriteTokens, @CacheReadTokens, @OutputTokens, @costUsd)
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(
            Sql,
            new { userId, model, usage.InputTokens, usage.CacheWriteTokens, usage.CacheReadTokens, usage.OutputTokens, costUsd },
            cancellationToken: ct));
    }

    /// <summary>What the user spent since midnight in Lisbon, in US dollars.</summary>
    public async Task<decimal> SpentTodayAsync(Guid userId, CancellationToken ct)
    {
        const string Sql = """
            select coalesce(sum(cost_usd), 0) from assistant_usage
            where user_id = @userId
              and created_at >= date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon'
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<decimal>(new CommandDefinition(Sql, new { userId }, cancellationToken: ct));
    }
}
