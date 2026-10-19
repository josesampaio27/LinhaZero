using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Incidents;

/// <summary>Means on the ground: people, land vehicles and aircraft.</summary>
public sealed record IncidentResources(int People, int Vehicles, int Aerial);

/// <summary>One active rural fire from fogos.pt, normalised.</summary>
public sealed record Incident(string Id, double Lat, double Lon, string Place, string Status, DateTime? StartedAt, string Nature, IncidentResources Resources);

/// <summary>The GET /api/v1/incidents/active body (contracts/examples/incidents.json).</summary>
public sealed record IncidentsResponse(List<Incident> Incidents, SourceStatus Source);
