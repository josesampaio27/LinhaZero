using System.Reflection;
using Dapper;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LinhaZero.Core.Database;

/// <summary>A schema change: Database/Migrations/NNN_name.sql, named by its file name without ".sql".</summary>
public sealed record Migration(string Version, string Sql);

/// <summary>
/// Applies the schema changes a database doesn't have yet (docs/decisoes/0065). infra/db/000-003 are the baseline, run by
/// the postgres image on an empty volume; every change after that is a script in Database/Migrations/, embedded in this
/// assembly, applied by the API when it starts and recorded in schema_migrations.
/// Everything happens in one transaction under an advisory lock: two replicas starting together apply each script once,
/// and a failing script leaves nothing behind.
/// </summary>
public sealed class Migrator(NpgsqlDataSource db, IReadOnlyList<Migration> migrations, ILogger log)
{
    /// <summary>Any constant, the same in every process; only migrations take it.</summary>
    private const long LockKey = 0x4C5A_4D49_4752; // "LZMIGR"

    /// <summary>The scripts embedded from Database/Migrations, in name order.</summary>
    public static IReadOnlyList<Migration> Embedded()
    {
        var assembly = typeof(Migrator).Assembly;
        const string Prefix = "LinhaZero.Core.Database.Migrations.";
        return assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(Prefix, StringComparison.Ordinal) && name.EndsWith(".sql", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .Select(name => new Migration(name[Prefix.Length..^".sql".Length], Read(assembly, name)))
            .ToList();
    }

    /// <summary>Applies what is missing and returns the versions it applied (empty when the schema is up to date).</summary>
    public async Task<IReadOnlyList<string>> MigrateAsync(CancellationToken ct)
    {
        await using var connection = await db.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        await connection.ExecuteAsync(new CommandDefinition("select pg_advisory_xact_lock(@LockKey)", new { LockKey }, tx, cancellationToken: ct));
        await connection.ExecuteAsync(new CommandDefinition(
            """
            create table if not exists schema_migrations (
              version    text primary key,
              applied_at timestamptz not null default now()
            )
            """,
            transaction: tx,
            cancellationToken: ct));

        var done = (await connection.QueryAsync<string>(new CommandDefinition("select version from schema_migrations", transaction: tx, cancellationToken: ct)))
            .ToHashSet(StringComparer.Ordinal);
        var applied = new List<string>();
        foreach (var migration in migrations.Where(m => !done.Contains(m.Version)))
        {
            await connection.ExecuteAsync(new CommandDefinition(migration.Sql, transaction: tx, cancellationToken: ct));
            await connection.ExecuteAsync(new CommandDefinition(
                "insert into schema_migrations (version) values (@Version)", new { migration.Version }, tx, cancellationToken: ct));
            log.LogInformation("Migração aplicada: {Version}", migration.Version);
            applied.Add(migration.Version);
        }

        await tx.CommitAsync(ct);
        return applied;
    }

    private static string Read(Assembly assembly, string name)
    {
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
