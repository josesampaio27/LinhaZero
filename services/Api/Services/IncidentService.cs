using LinhaZero.Core.Geo;
using LinhaZero.Core.Incidents;
using LinhaZero.Core.Incidents.Fogos;
using LinhaZero.Core.Sources;

namespace LinhaZero.Api.Services;

/// <summary>Active rural fires inside a box, from the newest fogos.pt snapshot.</summary>
public sealed class IncidentService(SnapshotReader snapshots)
{
    public async Task<IncidentsResponse> GetActiveAsync(BoundingBox box, CancellationToken ct)
    {
        var fogos = await snapshots.LatestAsync<FogosActiveFile>(SourceCatalog.FogosActive, "", DateTime.UtcNow, ct);
        return IncidentParser.Build(fogos, box);
    }
}
