using LinhaZero.Api.Models;
using LinhaZero.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LinhaZero.Api.Controllers;

[ApiController]
[Route("api/v1/health")]
[AllowAnonymous] // probes and smoke.sh, without a session
public sealed class HealthController(HealthService health) : ControllerBase
{
    /// <summary>Whether Postgres and NATS answer, and how many engine workers are idle.</summary>
    /// <remarks>200 even with no idle worker, so the web can tell "no workers" apart from "API down"; 503 when Postgres or NATS fail.</remarks>
    /// <param name="ct">Request cancellation.</param>
    [HttpGet]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var report = await health.CheckAsync(ct);
        var allUp = report.Postgres && report.Nats;
        return StatusCode(allUp ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable, report);
    }
}
