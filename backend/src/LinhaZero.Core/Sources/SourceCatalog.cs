namespace LinhaZero.Core.Sources;

/// <summary>The names of the sources ingest pulls, as stored in snapshots.source and source_status.source.</summary>
public static class SourceCatalog
{
    public const string IpmaStations = "ipma-stations";
    public const string IpmaObservations = "ipma-observations";
    public const string IpmaRcm = "ipma-rcm-d0";
    public const string IpmaWarnings = "ipma-warnings";
    public const string IpmaDistricts = "ipma-districts";
    public const string OpenMeteo = "open-meteo";
    public const string FogosActive = "fogos-active";

    public static IReadOnlyList<string> All { get; } =
        [IpmaStations, IpmaObservations, IpmaRcm, IpmaWarnings, IpmaDistricts, OpenMeteo, FogosActive];
}
