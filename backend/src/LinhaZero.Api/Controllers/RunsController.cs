using System.Text.Json;
using LinhaZero.Api.Models;
using LinhaZero.Api.OpenApi;
using LinhaZero.Api.Services;
using LinhaZero.Api.Validation;
using LinhaZero.Core.Grids;
using Microsoft.AspNetCore.Mvc;

namespace LinhaZero.Api.Controllers;

[ApiController]
[Route("api/v1/runs")]
public sealed class RunsController(RunService runs, RunEventStream events, GridCatalog grids, ILogger<RunsController> log) : ControllerBase
{
    /// <summary>Queues a run of decisions A and B on the engine workers.</summary>
    /// <remarks>
    /// Answers 202 at once with the run id; follow it with GET /runs/{id}/events. 503 when the queue is unavailable,
    /// and then the web runs the ensemble in the browser.
    /// </remarks>
    [HttpPost]
    [RawJsonBody(typeof(RunRequest))]
    [ProducesResponseType<RunAccepted>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Create(CancellationToken ct)
    {
        // Read as text, not bound with [FromBody]: the strict parser rejects duplicate keys, and the fields the API does
        // not model (each intervention's "kind", "variants", "weather") must reach the worker exactly as sent.
        var body = await new StreamReader(Request.Body).ReadToEndAsync(ct);
        ParsedRunRequest parsed;
        try
        {
            parsed = RunRequestParser.Parse(body);
        }
        catch (Exception e) when (e is JsonException or BadHttpRequestException)
        {
            log.LogInformation("POST /runs rejeitado: {Error}", e.Message);
            return BadRequest(new ErrorResponse(RunRequestParser.InvalidBody));
        }

        var grid = grids.Load(parsed.Request.Grid);
        if (RunRequestParser.Validate(parsed.Request, grid) is { } error)
        {
            return BadRequest(new ErrorResponse(error));
        }

        var id = Guid.NewGuid();
        if (!await runs.EnqueueAsync(id, parsed.Json, ct))
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new ErrorResponse(RunService.QueueUnavailable));
        }

        return Accepted($"/api/v1/runs/{id}", new RunAccepted(id));
    }

    /// <summary>State of a run, and its result once done.</summary>
    /// <param name="id">The run id returned by POST /runs.</param>
    /// <param name="ct">Request cancellation.</param>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<RunStatusResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var run = await runs.GetAsync(id, ct);
        return run is null ? NotFound(new ErrorResponse("corrida desconhecida")) : Ok(run);
    }

    /// <summary>Progress of a run as Server-Sent Events.</summary>
    /// <remarks>
    /// The event name is the type: progress, done or failed, with the RunEvent JSON as data. The stream ends after done
    /// or failed. An "event: ping" with no data every 15 s keeps proxies from closing the connection.
    /// </remarks>
    /// <param name="id">The run id returned by POST /runs.</param>
    /// <param name="ct">Request cancellation.</param>
    [HttpGet("{id:guid}/events")]
    [ProducesResponseType<RunEvent>(StatusCodes.Status200OK, "text/event-stream")]
    public IResult Events(Guid id, CancellationToken ct) => TypedResults.ServerSentEvents(events.EventsAsync(id, ct));

    /// <summary>One result raster of a finished run.</summary>
    /// <remarks>Little-endian Float32, rows × cols × 4 bytes (rows and cols are in the result). Results never change, so it is cached for a year.</remarks>
    /// <param name="id">The run id.</param>
    /// <param name="decision">A or B.</param>
    /// <param name="layer">arrival (minutes until the fire arrives) or probability (share of runs where the cell burns).</param>
    /// <param name="ct">Request cancellation.</param>
    [HttpGet("{id:guid}/rasters/{decision}/{layer}")]
    [ProducesResponseType<Stream>(StatusCodes.Status200OK, "application/octet-stream")]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Raster(Guid id, string decision, string layer, CancellationToken ct)
    {
        var knownLayer = decision is ("A" or "B") && layer is ("arrival" or "probability");
        if (!knownLayer)
        {
            return BadRequest(new ErrorResponse("decisão A ou B; camada arrival ou probability"));
        }

        var data = await runs.RasterAsync(id, decision, layer, ct);
        if (data is null)
        {
            return NotFound(new ErrorResponse("raster indisponível"));
        }

        Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return File(data, "application/octet-stream");
    }
}
