using Dapper;
using LinhaZero.Api.Models;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>The SQL on the access_requests table (infra/db/003_access_requests.sql).</summary>
public sealed class AccessRequestRepository(NpgsqlDataSource db)
{
    private const string Columns = "id, name, email, organization, organization_type, message, status, created_at, decided_at";

    public async Task InsertAsync(AccessRequestCreate request, CancellationToken ct)
    {
        const string Sql = """
            insert into access_requests (name, email, organization, organization_type, message)
            values (@Name, @Email, @Organization, @OrganizationType, @Message)
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition(Sql, request, cancellationToken: ct));
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
