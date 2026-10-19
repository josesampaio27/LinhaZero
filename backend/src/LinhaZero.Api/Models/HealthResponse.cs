namespace LinhaZero.Api.Models;

/// <summary>
/// The GET /api/v1/health body. <c>idleWorkers</c> counts the engine workers waiting for a job right now
/// (a worker in the middle of a run is not counted).
/// </summary>
public sealed record HealthResponse(bool Postgres, bool Nats, int IdleWorkers);
