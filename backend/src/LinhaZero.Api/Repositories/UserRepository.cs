using Dapper;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>The SQL on the users table (infra/db/002_users.sql). A user is created on their first login.</summary>
public sealed class UserRepository(NpgsqlDataSource db)
{
    /// <summary>Creates or refreshes the user Keycloak identified (issuer + subject) and returns our users.id.</summary>
    public async Task<Guid> UpsertOnLoginAsync(string issuer, string subject, string? email, string name, CancellationToken ct)
    {
        const string Sql = """
            insert into users (issuer, subject, email, name, last_login_at) values (@issuer, @subject, @email, @name, now())
            on conflict (issuer, subject) do update set email = excluded.email, name = excluded.name, last_login_at = now()
            returning id
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<Guid>(new CommandDefinition(Sql, new { issuer, subject, email, name }, cancellationToken: ct));
    }
}
