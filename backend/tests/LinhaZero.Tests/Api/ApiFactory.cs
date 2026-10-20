using System.Security.Claims;
using System.Text.Encodings.Web;
using LinhaZero.Api.Auth;
using LinhaZero.Api.Controllers;
using LinhaZero.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NATS.Client.Core;
using Npgsql;

namespace LinhaZero.Tests;

/// <summary>
/// The real API in memory, with Postgres and NATS pointed at a closed port: the tests behave the same whether or not
/// the compose stack is running. The grids are the repo's web/public/grids.
/// <see cref="CreateClient()"/> is signed in as a test user (the <see cref="TestUser.Header"/> header) and sends the CSRF
/// header; <see cref="CreateAnonymousClient"/> sends neither, as a browser without a session.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<HealthController>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("GRIDS_DIR", RepoGrids());
        builder.UseSetting("CORS_ORIGINS", LandingOrigin);
        builder.UseSetting("ACCESS_REQUESTS_PER_HOUR", "1000"); // AccessRequestsHttpTests checks the real limit on its own
        builder.ConfigureServices(services =>
        {
            services.AddSingleton(_ => Pg.CreateDataSource("Host=127.0.0.1;Port=1;Username=x;Password=x;Database=x;Timeout=2"));
            services.AddSingleton(_ => new NatsConnection(new NatsOpts { Url = "nats://127.0.0.1:1", Name = "api-test" }));
        });
        builder.ConfigureTestServices(services =>
        {
            // The cookie keys in memory (the real ones are in Postgres), and the test user read from a header.
            services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
            services.AddAuthentication().AddScheme<AuthenticationSchemeOptions, TestUser>(TestUser.SchemeName, _ => { });
            services.Configure<AuthenticationOptions>(auth => auth.DefaultAuthenticateScheme = TestUser.SchemeName);
            services.AddSingleton<IKeycloakAdmin, FakeKeycloakAdmin>();
        });
    }

    protected override void ConfigureClient(HttpClient client)
    {
        base.ConfigureClient(client);
        client.DefaultRequestHeaders.Add(TestUser.Header, "Utilizador de teste");
        client.DefaultRequestHeaders.Add(AuthSetup.CsrfHeader, "1");
    }

    public const string LandingOrigin = "https://landing.linhazero.test";

    /// <summary>Signed in with the admin role (linhazero-admin).</summary>
    public HttpClient CreateAdminClient()
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Add(TestUser.RolesHeader, "linhazero-admin");
        return client;
    }

    /// <summary>No session and no CSRF header; redirects are returned, not followed.</summary>
    public HttpClient CreateAnonymousClient()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Remove(TestUser.Header);
        client.DefaultRequestHeaders.Remove(AuthSetup.CsrfHeader);
        return client;
    }

    /// <summary>web/public/grids, found by walking up from the test binaries.</summary>
    private static string RepoGrids()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !Directory.Exists(Path.Combine(directory.FullName, "web", "public", "grids")))
        {
            directory = directory.Parent;
        }

        return directory is null ? "web/public/grids" : Path.Combine(directory.FullName, "web", "public", "grids");
    }
}

/// <summary>Signs the request in as the user named in the X-Test-User header; no header, no user (as without the cookie).</summary>
public sealed class TestUser(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Test";
    public const string Header = "X-Test-User";
    public const string RolesHeader = "X-Test-Roles";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (Request.Headers[Header] is not [{ Length: > 0 } name])
        {
            return Task.FromResult(AuthenticateResult.NoResult());
        }

        var roles = Request.Headers[RolesHeader].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries).Select(r => new Claim("role", r.Trim()));
        var identity = new ClaimsIdentity([new Claim("name", name), new Claim("email", "teste@linhazero.localhost"), .. roles], SchemeName, "name", "role");
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
    }
}

/// <summary>Keycloak's admin API, for tests: records the invites instead of sending them.</summary>
public sealed class FakeKeycloakAdmin : IKeycloakAdmin
{
    public List<string> Invited { get; } = [];

    public Task<string> InviteAsync(string email, string name, CancellationToken ct)
    {
        Invited.Add(email);
        return Task.FromResult(Guid.NewGuid().ToString());
    }
}
