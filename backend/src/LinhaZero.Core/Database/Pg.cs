using System.Data;
using Dapper;
using Npgsql;

namespace LinhaZero.Core.Database;

/// <summary>The PostgreSQL connection, from the libpq variables PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE.</summary>
public static class Pg
{
    /// <summary>
    /// Defaults are for a local run against the compose Postgres. 127.0.0.1 rather than localhost: on Windows,
    /// localhost tries IPv6 first, and the compose port is published on IPv4 only. GSS (Kerberos) encryption is off:
    /// the server does not use it, and probing for it logs a missing-library error in the .NET container images.
    /// </summary>
    public static string ConnectionString(string extra = "")
    {
        static string Read(string name, string fallback) =>
            Environment.GetEnvironmentVariable(name) is { Length: > 0 } value ? value : fallback;

        return $"Host={Read("PGHOST", "127.0.0.1")};Port={Read("PGPORT", "5432")};Username={Read("PGUSER", "dois")};"
            + $"Password={Read("PGPASSWORD", "dois")};Database={Read("PGDATABASE", "dois")};GSS Encryption Mode=Disable;{extra}";
    }

    /// <summary>The connection pool for the whole process, with Dapper set up for this schema.</summary>
    public static NpgsqlDataSource CreateDataSource(string? connectionString = null)
    {
        ConfigureDapper();
        return NpgsqlDataSource.Create(connectionString ?? ConnectionString());
    }

    private static void ConfigureDapper()
    {
        // Columns are snake_case (fetched_at), properties PascalCase (FetchedAt).
        DefaultTypeMap.MatchNamesWithUnderscores = true;
        // Dapper would send DateTime as 'timestamp without time zone', which Npgsql refuses for UTC values.
        // Every time column here is timestamptz.
        SqlMapper.AddTypeMap(typeof(DateTime), DbType.DateTimeOffset);
        SqlMapper.AddTypeMap(typeof(DateTime?), DbType.DateTimeOffset);
    }
}
