using LinhaZero.Ingest.Workers;
using Microsoft.Extensions.Options;

namespace LinhaZero.Ingest.Clients;

/// <summary>Registers the three upstream clients with the HTTP settings they share.</summary>
public static class UpstreamHttp
{
    public const string UserAgent = "LinhaZero/0.1 (rodrigorcvicente@gmail.com)";
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(8);

    /// <summary>
    /// IPMA, Open-Meteo and fogos.pt as typed clients: base address, 8 s timeout and User-Agent, and for fogos.pt the
    /// key from <see cref="IngestOptions.FogosApiKey"/> when there is one.
    /// <para>
    /// No automatic retries, on purpose: the pull loop already tries again on its next tick, a failure waits for the
    /// 429's Retry-After saved in source_status, and fogos.pt must get at most one request per interval. Retries
    /// hidden in the client would break all three.
    /// </para>
    /// </summary>
    public static IServiceCollection AddUpstreamClients(this IServiceCollection services)
    {
        services.AddUpstreamClient<IpmaClient>(IpmaClient.BaseAddress);
        services.AddUpstreamClient<OpenMeteoClient>(OpenMeteoClient.BaseAddress);
        services.AddUpstreamClient<FogosClient>(FogosClient.BaseAddress, (provider, http) =>
        {
            var apiKey = provider.GetRequiredService<IOptions<IngestOptions>>().Value.FogosApiKey;
            if (!string.IsNullOrEmpty(apiKey))
            {
                http.DefaultRequestHeaders.Add(FogosClient.ApiKeyHeader, apiKey);
            }
        });
        return services;
    }

    /// <summary>
    /// The clients are held by the ingest worker for the life of the process, so connections are pooled with a
    /// lifetime instead of rotating handlers (Microsoft's guidance for typed clients in singletons): DNS changes are
    /// still picked up.
    /// </summary>
    private static void AddUpstreamClient<TClient>(this IServiceCollection services, Uri baseAddress, Action<IServiceProvider, HttpClient>? configure = null)
        where TClient : class =>
        services
            .AddHttpClient<TClient>((provider, http) =>
            {
                http.BaseAddress = baseAddress;
                http.Timeout = Timeout;
                http.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
                configure?.Invoke(provider, http);
            })
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) })
            .SetHandlerLifetime(System.Threading.Timeout.InfiniteTimeSpan);
}
