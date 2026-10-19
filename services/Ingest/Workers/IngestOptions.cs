namespace LinhaZero.Ingest.Workers;

public sealed class IngestOptions
{
    /// <summary>INGEST_OFFLINE=1: never contact the sources (offline demo); the API serves the newest saved snapshots.</summary>
    public bool Offline { get; set; }

    /// <summary>FOGOS_API_KEY, sent in the X-API-Key header. Without it fogos.pt may answer 429.</summary>
    public string? FogosApiKey { get; set; }
}
