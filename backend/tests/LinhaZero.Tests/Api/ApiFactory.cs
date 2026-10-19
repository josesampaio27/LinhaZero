using LinhaZero.Api.Controllers;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using NATS.Client.Core;
using Npgsql;

namespace LinhaZero.Tests;

/// <summary>
/// The real API in memory, with Postgres and NATS pointed at a closed port: the tests behave the same whether or not
/// the compose stack is running. The grids are the repo's web/public/grids.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<HealthController>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("GRIDS_DIR", RepoGrids());
        builder.ConfigureServices(services =>
        {
            services.AddSingleton(_ => Pg.CreateDataSource("Host=127.0.0.1;Port=1;Username=x;Password=x;Database=x;Timeout=2"));
            services.AddSingleton(_ => new NatsConnection(new NatsOpts { Url = "nats://127.0.0.1:1", Name = "api-test" }));
        });
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
