using System.Net;
using System.Text.Json;
using LinhaZero.Ingest.Workers;
using Microsoft.Extensions.DependencyInjection;

namespace LinhaZero.Tests;

/// <summary>
/// The typed clients as registered in Ingest/Program.cs, with the network replaced by a handler that records each
/// request. The URLs must be exactly the ones the snapshots were saved with before the clients existed.
/// </summary>
public class UpstreamClientTests
{
    private sealed class RecordingHandler : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("[]"), RequestMessage = request });
        }
    }

    private static (ServiceProvider Provider, RecordingHandler Handler) Register(string? fogosKey)
    {
        var handler = new RecordingHandler();
        var services = new ServiceCollection();
        services.Configure<IngestOptions>(options => options.FogosApiKey = fogosKey);
        services.AddUpstreamClients();
        // Same clients, with the network swapped for the recording handler (the last primary handler wins).
        services.AddHttpClient<IpmaClient>().ConfigurePrimaryHttpMessageHandler(() => handler);
        services.AddHttpClient<OpenMeteoClient>().ConfigurePrimaryHttpMessageHandler(() => handler);
        services.AddHttpClient<FogosClient>().ConfigurePrimaryHttpMessageHandler(() => handler);
        return (services.BuildServiceProvider(), handler);
    }

    private static string RecordedUrl(string fixture)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "fixtures", fixture + ".meta.json");
        using var meta = JsonDocument.Parse(File.ReadAllText(path));
        return meta.RootElement.GetProperty("url").GetString()!;
    }

    [Fact]
    public async Task Ipma_urls_are_the_recorded_ones()
    {
        var (provider, handler) = Register(fogosKey: null);
        var ipma = provider.GetRequiredService<IpmaClient>();

        await ipma.GetStationsAsync(default);
        await ipma.GetObservationsAsync(default);
        await ipma.GetFireRiskAsync(default);
        await ipma.GetWarningsAsync(default);
        await ipma.GetDistrictsAsync(default);

        string[] expected = [RecordedUrl("stations"), RecordedUrl("observations"), RecordedUrl("rcm-d0"), RecordedUrl("warnings_www"), RecordedUrl("distrits-islands")];
        Assert.Equal(expected, handler.Requests.Select(request => request.RequestUri!.ToString()));
    }

    [Fact]
    public async Task Open_Meteo_url_is_the_recorded_one()
    {
        var (provider, handler) = Register(fogosKey: null);

        // The fixture was recorded for one point, before the lattice; the same point gives the same URL. It was also
        // recorded before cloud cover and hourly temperature were asked for (fuel moisture) and with 6 forecast hours.
        await provider.GetRequiredService<OpenMeteoClient>().GetForecastAsync([new GeoPoint(41.43, -8.27)], default);

        var expected = RecordedUrl("open-meteo")
            .Replace("latitude=41.43&longitude=-8.27", "latitude=41.4300&longitude=-8.2700")
            .Replace("temperature_2m&hourly=", "temperature_2m,cloud_cover&hourly=")
            .Replace("relative_humidity_2m&wind_speed_unit", "relative_humidity_2m,temperature_2m,cloud_cover&wind_speed_unit")
            .Replace("forecast_hours=7", $"forecast_hours={WeatherBuilder.ForecastHours + 1}");
        Assert.Equal(expected, Assert.Single(handler.Requests).RequestUri!.ToString());
    }

    [Fact]
    public async Task Fogos_key_goes_in_the_header_and_never_in_the_url()
    {
        var (provider, handler) = Register(fogosKey: "secret-key");

        var response = await provider.GetRequiredService<FogosClient>().GetActiveIncidentsAsync(default);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(RecordedUrl("fogos-active"), request.RequestUri!.ToString());
        Assert.DoesNotContain("secret-key", request.RequestUri.ToString());
        Assert.Equal("secret-key", Assert.Single(request.Headers.GetValues(FogosClient.ApiKeyHeader)));
        Assert.Equal(request.RequestUri, response.RequestMessage!.RequestUri); // the URL the snapshot is saved with
    }

    [Fact]
    public async Task Without_a_key_no_key_header_is_sent()
    {
        var (provider, handler) = Register(fogosKey: null);

        await provider.GetRequiredService<FogosClient>().GetActiveIncidentsAsync(default);

        Assert.False(Assert.Single(handler.Requests).Headers.Contains(FogosClient.ApiKeyHeader));
    }

    [Fact]
    public async Task Every_client_sends_the_user_agent()
    {
        var (provider, handler) = Register(fogosKey: null);

        await provider.GetRequiredService<IpmaClient>().GetStationsAsync(default);
        await provider.GetRequiredService<FogosClient>().GetActiveIncidentsAsync(default);
        await provider.GetRequiredService<OpenMeteoClient>().GetForecastAsync([new GeoPoint(41.45, -8.29)], default);

        Assert.All(handler.Requests, request => Assert.Equal(UpstreamHttp.UserAgent, request.Headers.UserAgent.ToString()));
    }
}
