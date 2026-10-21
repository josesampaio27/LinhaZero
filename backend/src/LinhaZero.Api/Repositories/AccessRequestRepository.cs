using Dapper;
using LinhaZero.Api.Models;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>The SQL on the access_requests table (infra/db/003_access_requests.sql, Database/Migrations/005).</summary>
public sealed class AccessRequestRepository(NpgsqlDataSource db)
{
    private const long EmailBudgetLock = 0x4C5A_4D41_494C; // "LZMAIL"

    private const string Columns = "id, name, email, organization, organization_type, message, status, created_at, decided_at";

    /// <summary>The new request's id; null when this email already has a pending request (nothing is added).</summary>
    public async Task<Guid?> InsertAsync(AccessRequestCreate request, CancellationToken ct)
    {
        const string Sql = """
            insert into access_requests (name, email, organization, organization_type, message)
            select @Name, @Email, @Organization, @OrganizationType, @Message
            where not exists (select 1 from access_requests where email = @Email and status = 'pending')
            returning id
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<Guid?>(new CommandDefinition(Sql, request, cancellationToken: ct));
    }

    /// <summary>
    /// Counts <paramref name="recipients"/> emails for this request against today's (UTC) budget; false, and nothing
    /// recorded, when they don't fit under <paramref name="perDay"/> (docs/decisoes/0067).
    /// </summary>
    public async Task<bool> ReserveNotificationAsync(Guid id, int recipients, int perDay, CancellationToken ct)
    {
        const string Sql = """
            update access_requests set notified_at = now(), notified_count = @recipients
            where id = @id and notified_at is null
              and (select coalesce(sum(notified_count), 0) from access_requests
                   where notified_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') + @recipients <= @perDay
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        // One reservation at a time (all replicas): otherwise two could both see room for the last emails.
        await connection.ExecuteAsync(new CommandDefinition("select pg_advisory_xact_lock(@EmailBudgetLock)", new { EmailBudgetLock }, tx, cancellationToken: ct));
        var reserved = await connection.ExecuteAsync(new CommandDefinition(Sql, new { id, recipients, perDay }, tx, cancellationToken: ct)) == 1;
        await tx.CommitAsync(ct);
        return reserved;
    }

    /// <summary>Gives the reserved emails back when sending failed.</summary>
    public async Task ReleaseNotificationAsync(Guid id, CancellationToken ct)
    {
        const string Sql = "update access_requests set notified_at = null, notified_count = 0 where id = @id";
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, new { id }, cancellationToken: ct));
    }

    /// <summary>Pending ones first (oldest first), then the answered ones (newest first), at most 200.</summary>
    public async Task<IReadOnlyList<AccessRequestResponse>> ListAsync(CancellationToken ct)
    {
        const string Sql = $"""
            select {Columns} from access_requests
            order by status <> 'pending', case when status = 'pending' then created_at end, created_at desc
            limit 200
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return (await connection.QueryAsync<AccessRequestResponse>(new CommandDefinition(Sql, cancellationToken: ct))).ToList();
    }

    public async Task<AccessRequestResponse?> GetAsync(Guid id, CancellationToken ct)
    {
        const string Sql = $"select {Columns} from access_requests where id = @id";
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.QuerySingleOrDefaultAsync<AccessRequestResponse>(new CommandDefinition(Sql, new { id }, cancellationToken: ct));
    }

    /// <summary>Answers a pending request; false when someone else answered it first.</summary>
    public async Task<bool> DecideAsync(Guid id, string status, Guid? decidedBy, string? keycloakUserId, CancellationToken ct)
    {
        const string Sql = """
            update access_requests set status = @status, decided_at = now(), decided_by = @decidedBy, keycloak_user_id = @keycloakUserId
            where id = @id and status = 'pending'
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteAsync(new CommandDefinition(Sql, new { id, status, decidedBy, keycloakUserId }, cancellationToken: ct)) == 1;
    }
}
