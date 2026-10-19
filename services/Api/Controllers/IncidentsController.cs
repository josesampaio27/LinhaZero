using LinhaZero.Api.Models;
using LinhaZero.Api.Services;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Incidents;
using Microsoft.AspNetCore.Mvc;

namespace LinhaZero.Api.Controllers;

[ApiController]
[Route("api/v1/incidents")]
public sealed class IncidentsController(IncidentService incidents) : ControllerBase
{
    /// <summary>Active rural fires from fogos.pt inside a bounding box.</summary>
    /// <param name="bbox">minLon,minLat,maxLon,maxLat in degrees, for example -8.4,41.4,-8.2,41.5.</param>
    /// <param name="ct">Request cancellation.</param>
    [HttpGet("active")]
    [ProducesResponseType<IncidentsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Active(string? bbox, CancellationToken ct)
    {
        if (!BoundingBox.TryParse(bbox, out var box))
        {
            return BadRequest(new ErrorResponse("bbox=minLon,minLat,maxLon,maxLat obrigatório"));
        }

        return Ok(await incidents.GetActiveAsync(box, ct));
    }
}
