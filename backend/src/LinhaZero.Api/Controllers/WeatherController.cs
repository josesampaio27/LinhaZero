using LinhaZero.Api.Models;
using LinhaZero.Api.Services;
using LinhaZero.Core.Geo;
using LinhaZero.Core.Weather;
using Microsoft.AspNetCore.Mvc;

namespace LinhaZero.Api.Controllers;

[ApiController]
[Route("api/v1/weather")]
public sealed class WeatherController(WeatherService weather) : ControllerBase
{
    /// <summary>Wind, humidity, fire risk and warnings for a point in mainland Portugal.</summary>
    /// <remarks>
    /// Built from the newest snapshots saved by ingest: the nearest IPMA station within 25 km and 3 h, otherwise the
    /// Open-Meteo model. Each source says how old it is and whether it is stale.
    /// </remarks>
    /// <param name="lat">Latitude, 36.5 to 42.5.</param>
    /// <param name="lon">Longitude, -10 to -6.</param>
    /// <param name="ct">Request cancellation.</param>
    [HttpGet]
    [ProducesResponseType<WeatherResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<WeatherUnavailableResponse>(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Get(double? lat, double? lon, CancellationToken ct)
    {
        var insideMainland = lat is >= 36.5 and <= 42.5 && lon is >= -10 and <= -6;
        if (!insideMainland)
        {
            return BadRequest(new ErrorResponse("lat e lon obrigatórios, dentro de Portugal continental (36.5–42.5 N, -10–-6 E)"));
        }

        var answer = await weather.GetAsync(new GeoPoint(lat!.Value, lon!.Value), ct);
        if (answer.Use is null)
        {
            var noWind = new WeatherUnavailableResponse("Sem vento disponível em nenhuma fonte", answer.Sources);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, noWind);
        }

        return Ok(answer);
    }
}
