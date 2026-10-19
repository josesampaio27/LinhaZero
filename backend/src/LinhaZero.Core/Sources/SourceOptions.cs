using Microsoft.Extensions.Configuration;

namespace LinhaZero.Core.Sources;

/// <summary>
/// How often each source is pulled. Ingest waits this long between pulls; the API calls a snapshot stale when it is
/// older than twice this.
/// </summary>
public sealed class SourceOptions
{
    public Dictionary<string, int> IntervalMinutes { get; } = new()
    {
        [SourceCatalog.IpmaObservations] = 10,
        [SourceCatalog.IpmaWarnings] = 10,
        [SourceCatalog.IpmaRcm] = 60,
        [SourceCatalog.IpmaStations] = 1440,
        [SourceCatalog.IpmaDistricts] = 1440,
        [SourceCatalog.OpenMeteo] = 15,
        [SourceCatalog.FogosActive] = 2,
    };

    public TimeSpan Interval(string source) => TimeSpan.FromMinutes(IntervalMinutes[source]);

    /// <summary>Applies INGEST_INTERVAL_&lt;SOURCE&gt; (for example INGEST_INTERVAL_FOGOS_ACTIVE=5) over the defaults.</summary>
    public void ReadFrom(IConfiguration configuration)
    {
        foreach (var source in SourceCatalog.All)
        {
            var variable = "INGEST_INTERVAL_" + source.ToUpperInvariant().Replace('-', '_');
            if (int.TryParse(configuration[variable], out var minutes) && minutes > 0)
            {
                IntervalMinutes[source] = minutes;
            }
        }
    }
}
