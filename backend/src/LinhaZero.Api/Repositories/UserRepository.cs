using Dapper;
using Npgsql;

namespace LinhaZero.Api.Repositories;

/// <summary>The SQL on the users table (infra/db/002_users.sql). A user is created on their first login.</summary>
public sealed class UserRepository(NpgsqlDataSource db)
{
    /// <summary>
    /// Creates or refreshes the user Keycloak identified (issuer + subject) and returns our users.id. <paramref name="isAdmin"/>
    /// (the linhazero-admin role in this login) is stored too: it decides who gets the access-request emails.
    /// </summary>
    public async Task<Guid> UpsertOnLoginAsync(string issuer, string subject, string? email, string name, bool isAdmin, CancellationToken ct)
    {
        const string Sql = """
            insert into users (issuer, subject, email, name, is_admin, last_login_at) values (@issuer, @subject, @email, @name, @isAdmin, now())
            on conflict (issuer, subject) do update
              set email = excluded.email, name = excluded.name, is_admin = excluded.is_admin, last_login_at = now()
            returning id
            """;
        await using var connection = await db.OpenConnectionAsync(ct);
        return await connection.ExecuteScalarAsync<Guid>(new CommandDefinition(Sql, new { issuer, subject, email, name, isAdmin }, cancellationToken: ct));
    }

    /// <summary>The email of every admin, as of their last login (docs/decisoes/0067).</summary>
    public async Task<IReadOnlyList<string>> AdminEmailsAsync(CancellationToken ct)
    {
        // distinct: one person can have several rows (another issuer, e.g. the Vite dev server's login).
        const string Sql = "select distinct lower(email) from users where is_admin and email is not null and email <> '' order by 1";
        await using var connection = await db.OpenConnectionAsync(ct);
        return (await connection.QueryAsync<string>(new CommandDefinition(Sql, cancellationToken: ct))).ToList();
    }
}
