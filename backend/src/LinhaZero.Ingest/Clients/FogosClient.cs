namespace LinhaZero.Ingest.Clients;

/// <summary>
/// The fogos.pt API (https://api.fogos.pt). The key, when there is one, goes in the <see cref="ApiKeyHeader"/> header,
/// never in the URL: the URL is saved with each snapshot and the demo seed is committed.
/// </summary>
public sealed class FogosClient(HttpClient http)
{
    public static readonly Uri BaseAddress = new("https://api.fogos.pt/");
    public const string ApiKeyHeader = "X-API-Key";

    /// <summary>The active incidents. Without a key fogos.pt may answer 429 with a Retry-After.</summary>
    public Task<HttpResponseMessage> GetActiveIncidentsAsync(CancellationToken ct) => http.GetAsync("v2/incidents/active", ct);
}
