using Dapper;
using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Services;
using LinhaZero.Core.Database;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;

namespace LinhaZero.Tests;

/// <summary>
/// The email to the admins on each "Pedir acesso" (Services/AccessRequestNotifier.cs, docs/decisoes/0067). The database
/// tests (TEST_PG) build the real users and access_requests tables, plus every migration, in a schema of their own,
/// so neither the local data nor other tests count against the daily budget.
/// </summary>
public sealed class AccessRequestEmailTests : IAsyncLifetime
{
    private readonly string _schema = "mail_" + Guid.NewGuid().ToString("N")[..8];
    private readonly FakeEmailSender _email = new();
    private NpgsqlDataSource _db = null!;

    public async Task InitializeAsync()
    {
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("TEST_PG"))) return;
        await using (var admin = NpgsqlDataSource.Create(PostgresTests.ConnectionString))
        {
            await admin.CreateCommand($"create schema {_schema}").ExecuteNonQueryAsync();
        }

        _db = Pg.CreateDataSource(new NpgsqlConnectionStringBuilder(PostgresTests.ConnectionString) { SearchPath = _schema }.ConnectionString);
        await using (var c = await _db.OpenConnectionAsync())
        {
            foreach (var baseline in new[] { "002_users.sql", "003_access_requests.sql" })
            {
                await c.ExecuteAsync(await File.ReadAllTextAsync(Path.Combine(RepoDb(), baseline)));
            }
        }

        await new Migrator(_db, Migrator.Embedded(), NullLogger.Instance).MigrateAsync(default);
    }

    public async Task DisposeAsync()
    {
        if (_db is null) return;
        await _db.DisposeAsync();
        await using var admin = NpgsqlDataSource.Create(PostgresTests.ConnectionString);
        await admin.CreateCommand($"drop schema {_schema} cascade").ExecuteNonQueryAsync();
    }

    private static AccessRequestCreate Request(string email = "maria@bombeiros.pt", string? message = "Somos os BV de Guimarães.") =>
        new("Maria Silva", email, "Bombeiros Voluntários de Guimarães", "Bombeiros", message, null);

    private AccessRequestNotifier Notifier(int perDay = 100) => new(
        new AccessRequestRepository(_db),
        new UserRepository(_db),
        _email,
        Options.Create(new AccessRequestEmailOptions { PerDay = perDay, AppUrl = "https://app.linhazero.test/" }),
        NullLogger<AccessRequestNotifier>.Instance);

    private async Task Admins(params string[] emails)
    {
        var users = new UserRepository(_db);
        foreach (var email in emails)
        {
            await users.UpsertOnLoginAsync("https://kc.test", email, email, email, isAdmin: true, default);
        }
    }

    /// <summary>Saves the request and runs the notifier, as the controller does; null for a duplicate.</summary>
    private async Task<Guid?> Ask(AccessRequestNotifier notifier, AccessRequestCreate request)
    {
        var id = await new AccessRequestRepository(_db).InsertAsync(request, default);
        if (id is { } saved)
        {
            await notifier.NotifyAsync(saved, request, default);
        }

        return id;
    }

    private async Task<int> NotifiedCount(Guid id)
    {
        await using var c = await _db.OpenConnectionAsync();
        return await c.ExecuteScalarAsync<int>("select notified_count from access_requests where id = @id", new { id });
    }

    [Fact]
    public void The_email_is_plain_text_with_the_request_and_the_link()
    {
        var (subject, text) = AccessRequestNotifier.Compose(Request(message: new string('a', 600)), "https://app.linhazero.test/");
        Assert.Equal("Novo pedido de acesso: Bombeiros Voluntários de Guimarães", subject);
        Assert.Contains("Nome: Maria Silva", text);
        Assert.Contains("Email: maria@bombeiros.pt", text);
        Assert.Contains("Entidade: Bombeiros Voluntários de Guimarães (Bombeiros)", text);
        Assert.Contains(new string('a', AccessRequestNotifier.MaxMessage) + "…", text);
        Assert.DoesNotContain(new string('a', AccessRequestNotifier.MaxMessage + 1), text);
        Assert.Contains("https://app.linhazero.test/#/pedidos", text);
    }

    [Fact]
    public void Without_a_message_there_is_no_message_section()
    {
        var (_, text) = AccessRequestNotifier.Compose(Request(message: null), "https://app.linhazero.test/");
        Assert.DoesNotContain("Mensagem", text);
    }

    [PostgresFact]
    public async Task Every_admin_gets_one_email_with_reply_to_the_person()
    {
        await Admins("ana@linhazero.test", "rui@linhazero.test");
        await new UserRepository(_db).UpsertOnLoginAsync("https://kc.test", "user", "user@x.test", "User", isAdmin: false, default);

        var id = await Ask(Notifier(), Request());

        var sent = Assert.Single(_email.Messages);
        Assert.Equal(["ana@linhazero.test", "rui@linhazero.test"], sent.To);
        Assert.Equal("maria@bombeiros.pt", sent.ReplyTo);
        Assert.Equal(2, await NotifiedCount(id!.Value));
    }

    [PostgresFact]
    public async Task A_second_pending_request_from_the_same_email_is_dropped_without_email()
    {
        await Admins("ana@linhazero.test");
        var notifier = Notifier();
        Assert.NotNull(await Ask(notifier, Request()));
        Assert.Null(await Ask(notifier, Request()));
        Assert.Single(_email.Messages);
    }

    [PostgresFact]
    public async Task Past_the_daily_cap_requests_are_saved_without_email()
    {
        await Admins("ana@linhazero.test", "rui@linhazero.test");
        var notifier = Notifier(perDay: 3); // room for one request to two admins, not two

        var first = await Ask(notifier, Request("a@x.test"));
        var second = await Ask(notifier, Request("b@x.test"));

        Assert.Single(_email.Messages);
        Assert.NotNull(second); // saved all the same
        Assert.Equal((2, 0), (await NotifiedCount(first!.Value), await NotifiedCount(second!.Value)));
    }

    [PostgresFact]
    public async Task A_failed_send_gives_the_budget_back()
    {
        await Admins("ana@linhazero.test");
        _email.Fail = true;
        var id = await Ask(Notifier(perDay: 1), Request("a@x.test"));
        Assert.Equal(0, await NotifiedCount(id!.Value));

        _email.Fail = false;
        await Ask(Notifier(perDay: 1), Request("b@x.test"));
        Assert.Single(_email.Messages); // the failed one did not use up the single email of the day
    }

    [PostgresFact]
    public async Task Without_admins_nothing_is_sent()
    {
        await Ask(Notifier(), Request());
        Assert.Empty(_email.Messages);
    }

    [PostgresFact]
    public async Task The_admin_flag_follows_the_latest_login()
    {
        var users = new UserRepository(_db);
        await users.UpsertOnLoginAsync("https://kc.test", "s1", "ana@linhazero.test", "Ana", isAdmin: true, default);
        Assert.Equal(["ana@linhazero.test"], await users.AdminEmailsAsync(default));
        await users.UpsertOnLoginAsync("https://kc.test", "s1", "ana@linhazero.test", "Ana", isAdmin: false, default);
        Assert.Empty(await users.AdminEmailsAsync(default));
    }

    [PostgresFact]
    public async Task One_person_with_two_logins_gets_one_copy()
    {
        var users = new UserRepository(_db);
        await users.UpsertOnLoginAsync("https://kc.test", "s1", "Ana@LinhaZero.test", "Ana", isAdmin: true, default);
        await users.UpsertOnLoginAsync("http://localhost:5173", "s1", "ana@linhazero.test", "Ana", isAdmin: true, default);
        Assert.Equal(["ana@linhazero.test"], await users.AdminEmailsAsync(default));
    }

    /// <summary>infra/db, found by walking up from the test binaries.</summary>
    private static string RepoDb()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "infra", "db")))
        {
            directory = directory.Parent;
        }

        return Path.Combine(directory?.FullName ?? ".", "infra", "db");
    }
}
