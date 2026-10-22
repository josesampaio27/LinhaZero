using System.Reflection;
using System.Text.Json.Serialization;
using LinhaZero.Api.Auth;
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
// The largest bodies are the run request and an assistant conversation; the panel starts a new conversation well before 1 MB.
builder.WebHost.ConfigureKestrel(kestrel => kestrel.Limits.MaxRequestBodySize = 1_048_576);
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
// First: the schema is up to date before anything else starts. Not when the build starts the app only to write
// contracts/openapi.json (the GetDocument.Insider tool): there is no database there, e.g. in CI.
if (Assembly.GetEntryAssembly()?.GetName().Name != "GetDocument.Insider")
{
    services.AddHostedService<MigrateOnStart>();
}
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

// Login and sessions (Auth/AuthSetup.cs): every endpoint needs a session unless it is [AllowAnonymous]
services.AddLinhaZeroAuth(config);

// Application services (no per-request state, so singletons)
services.AddSingleton<SnapshotReader>();
services.AddSingleton<WeatherService>();
services.AddSingleton<IncidentService>();
services.AddSingleton<RunService>();
services.AddSingleton<RunEventStream>();
services.AddSingleton<HealthService>();

// The assistant (docs/decisoes/0079): Anthropic's Messages API, streamed through this API. No client timeout: an
// answer streams for as long as it takes, and the browser's request (its cancellation token) ends it.
services.Configure<AssistantOptions>(assistant => assistant.ReadFrom(config));
services.AddSingleton<AssistantUsageRepository>();
services
    .AddHttpClient<AssistantProxy>(http =>
    {
        http.BaseAddress = AssistantProxy.BaseAddress;
        http.Timeout = Timeout.InfiniteTimeSpan;
    })
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) });

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

app.UseLinhaZeroAuth();

// Both under /api/, so the proxy and Vite's proxy forward them too (https://app.linhazero.localhost/api/docs).
// The document needs a session, except in Development.
var openApi = app.MapOpenApi("/api/openapi/{documentName}.json");
if (app.Environment.IsDevelopment())
{
    openApi.AllowAnonymous();
}

app.UseSwaggerUI(swagger =>
{
    swagger.RoutePrefix = "api/docs";
    swagger.SwaggerEndpoint("/api/openapi/v1.json", "LinhaZero API v1");
    swagger.DocumentTitle = "LinhaZero API";
});
app.MapControllers();

app.Run();
