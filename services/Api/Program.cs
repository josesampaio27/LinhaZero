using System.Text.Json.Serialization;
using LinhaZero.Api.Messaging;
using LinhaZero.Api.OpenApi;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Services;
using LinhaZero.Core.Database;
using LinhaZero.Core.Grids;
using LinhaZero.Core.Sources;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.AspNetCore.Mvc.Formatters;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using NATS.Client.Core;
using NATS.Client.JetStream;

// Wiring only: the endpoints are in Controllers/, the logic in Services/, the SQL in Repositories/.
var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;
var services = builder.Services;

// Host
builder.Logging.ClearProviders().AddJsonConsole().AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = 1_048_576); // the only body is the run request
if (config["ASPNETCORE_URLS"] is null)
{
    builder.WebHost.UseUrls("http://localhost:8080");
}

// Settings, from the environment variables the compose file sets (infra/README.md)
services.Configure<GridOptions>(grids => grids.Directory = config["GRIDS_DIR"] ?? grids.Directory);
services.Configure<SourceOptions>(sources => sources.ReadFrom(config));
services.Configure<NatsOptions>(nats => nats.Url = config["NATS_URL"] ?? nats.Url);

// Infrastructure: one Postgres pool and one NATS connection for the whole process
services.AddSingleton(_ => Pg.CreateDataSource());
services.AddSingleton(provider =>
{
    var nats = provider.GetRequiredService<IOptions<NatsOptions>>().Value;
    return new NatsConnection(new NatsOpts { Url = nats.Url, Name = "api" });
});
services.AddSingleton(provider => new NatsJSContext(provider.GetRequiredService<NatsConnection>()));
services.AddSingleton<SnapshotStore>();
services.AddSingleton<RunRepository>();
services.AddSingleton<RunQueue>();
services.AddSingleton<GridCatalog>();
services.AddHostedService<NatsStreamSetup>();

// Application services (no per-request state, so singletons)
services.AddSingleton<SnapshotReader>();
services.AddSingleton<WeatherService>();
services.AddSingleton<IncidentService>();
services.AddSingleton<RunService>();
services.AddSingleton<RunEventStream>();
services.AddSingleton<HealthService>();

// Controllers. Every body is JSON, and every 400 is written by the controller with the { "error": "..." } the web shows.
services
    .AddControllers(mvc =>
    {
        mvc.Filters.Add(new ProducesAttribute("application/json"));
        mvc.OutputFormatters.RemoveType<StringOutputFormatter>();
    })
    .ConfigureApiBehaviorOptions(api => api.SuppressModelStateInvalidFilter = true);

// OpenAPI document. Its schemas follow these options: numbers are numbers (the web defaults would also allow "12").
services.ConfigureHttpJsonOptions(json => json.SerializerOptions.NumberHandling = JsonNumberHandling.Strict);
services.TryAddEnumerable(ServiceDescriptor.Transient<IApiDescriptionProvider, RawJsonBodyDescriptionProvider>());
services.AddOpenApi(openApi =>
{
    openApi.AddDocumentTransformer((document, _, _) =>
    {
        document.Info = new OpenApiInfo
        {
            Title = "LinhaZero API",
            Version = "v1",
            Description = "Weather and incidents from the ingested snapshots, and server runs of the fire engine "
                + "(queue, progress by SSE, results). Contracts: contracts/README.md.",
        };
        return Task.CompletedTask;
    });
    openApi.AddOperationTransformer<OperationIdTransformer>();
    openApi.AddSchemaTransformer<ClosedSchemaTransformer>();
});

var app = builder.Build();
app.Logger.LogInformation("API pronta; grelhas em {Grids}", app.Services.GetRequiredService<GridCatalog>().Directory);

// Both under /api/, so the web container and Vite's proxy forward them too (http://localhost:3000/api/docs).
app.MapOpenApi("/api/openapi/{documentName}.json");
app.UseSwaggerUI(swagger =>
{
    swagger.RoutePrefix = "api/docs";
    swagger.SwaggerEndpoint("/api/openapi/v1.json", "LinhaZero API v1");
    swagger.DocumentTitle = "LinhaZero API";
});
app.MapControllers();

app.Run();
