using System.Text.Json;
using Dapper;
using LinhaZero.Api.Models;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>The SQL on the feedback table (backend/src/LinhaZero.Core/Database/Migrations/004_feedback.sql).</summary>
public sealed class FeedbackRepository(NpgsqlDataSource db)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private const string Select = """
        select f.id, f.kind, f.message, f.may_contact, f.context::text as context, f.status, f.created_at, f.closed_at,
               u.name as user_name, u.email as user_email
        from feedback f join users u on u.id = f.user_id
        """;

    public async Task InsertAsync(Guid userId, FeedbackCreate report, CancellationToken ct)
    {
        const string Sql = """
            insert into feedback (user_id, kind, message, may_contact, context)
            values (@userId, @Kind, @Message, @MayContact, @context::jsonb)
            """;
        var context = JsonSerializer.Serialize(report.Context, Json);
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, new { userId, report.Kind, report.Message, report.MayContact, context }, cancellationToken: ct));
    }

    /// <summary>Open ones first (oldest first), then the closed ones (newest first), at most 200.</summary>
    public async Task<IReadOnlyList<FeedbackResponse>> ListAsync(CancellationToken ct)
    {
        const string Sql = $"""
            {Select}
            order by f.status <> 'open', case when f.status = 'open' then f.created_at end, f.created_at desc
            limit 200
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return (await connection.QueryAsync<Row>(new CommandDefinition(Sql, cancellationToken: ct))).Select(ToResponse).ToList();
    }

    public async Task<FeedbackResponse?> GetAsync(Guid id, CancellationToken ct)
    {
        const string Sql = $"{Select} where f.id = @id";
        await using var connection = await db.OpenConnectionAsync(ct);
        var row = await connection.QuerySingleOrDefaultAsync<Row>(new CommandDefinition(Sql, new { id }, cancellationToken: ct));
        return row is null ? null : ToResponse(row);
    }

    /// <summary>Closes (done, dismissed) or reopens a report; false when there is no such report.</summary>
    public async Task<bool> SetStatusAsync(Guid id, string status, Guid? by, CancellationToken ct)
    {
        const string Sql = """
            update feedback set status = @status,
              closed_at = case when @status = 'open' then null else now() end,
              closed_by = case when @status = 'open' then null else @by end
            where id = @id
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteAsync(new CommandDefinition(Sql, new { id, status, by }, cancellationToken: ct)) == 1;
    }

    private sealed record Row(
        Guid Id, string Kind, string Message, bool MayContact, string Context, string Status,
        DateTime CreatedAt, DateTime? ClosedAt, string UserName, string? UserEmail);

    private static FeedbackResponse ToResponse(Row r) => new(
        r.Id, r.Kind, r.Message, r.MayContact,
        JsonSerializer.Deserialize<FeedbackContext>(r.Context, Json) ?? new FeedbackContext(null, null, null, null, null, null),
        r.Status, r.CreatedAt, r.ClosedAt, r.UserName, r.UserEmail);
}
