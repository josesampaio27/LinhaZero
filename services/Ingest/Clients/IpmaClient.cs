namespace LinhaZero.Ingest.Clients;

/// <summary>The IPMA open-data files (https://api.ipma.pt). Each method returns the raw response: ingest saves the body as is.</summary>
public sealed class IpmaClient(HttpClient http)
{
    public static readonly Uri BaseAddress = new("https://api.ipma.pt/");

    /// <summary>All weather stations, with their coordinates (GeoJSON).</summary>
    public Task<HttpResponseMessage> GetStationsAsync(CancellationToken ct) =>
        http.GetAsync("open-data/observation/meteorology/stations/stations.json", ct);

    /// <summary>The last 24 hours of readings of every station.</summary>
    public Task<HttpResponseMessage> GetObservationsAsync(CancellationToken ct) =>
        http.GetAsync("open-data/observation/meteorology/stations/observations.json", ct);

    /// <summary>Today's fire risk (RCM) per municipality.</summary>
    public Task<HttpResponseMessage> GetFireRiskAsync(CancellationToken ct) =>
        http.GetAsync("open-data/forecast/meteorology/rcm/rcm-d0.json", ct);

    /// <summary>All current weather warnings.</summary>
    public Task<HttpResponseMessage> GetWarningsAsync(CancellationToken ct) =>
        http.GetAsync("open-data/forecast/warnings/warnings_www.json", ct);

    /// <summary>The places IPMA uses, each with its warning area.</summary>
    public Task<HttpResponseMessage> GetDistrictsAsync(CancellationToken ct) =>
        http.GetAsync("open-data/distrits-islands.json", ct);
}
