using LinhaZero.Api.Auth;
using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LinhaZero.Api.Controllers;

/// <summary>
/// "Reportar problema ou sugestão" (docs/decisoes/0066): any signed-in user sends one from the account menu; admins
/// (Keycloak role linhazero-admin) read them in the app and close them.
/// </summary>
[ApiController]
[Route("api/v1/feedback")]
public sealed class FeedbackController(FeedbackRepository feedback, ILogger<FeedbackController> log) : ControllerBase
{
    /// <summary>A report from the signed-in user.</summary>
    /// <remarks>At most FEEDBACK_PER_HOUR (20 by default) per user.</remarks>
    [HttpPost]
    [EnableRateLimiting(AuthSetup.FeedbackLimit)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Create([FromBody] FeedbackCreate? body, CancellationToken ct)
    {
        var (report, error) = FeedbackValidator.Validate(body);
        if (report is null)
        {
            return BadRequest(new ErrorResponse(error!));
        }

        // Every real session has a users row (created at login); only test sessions don't.
        if (AuthSetup.UserId(User) is not { } userId)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponse("Sessão sem utilizador."));
        }

        await feedback.InsertAsync(userId, report, ct);
        log.LogInformation("Relatório novo ({Kind})", report.Kind);
        return Accepted();
    }

    /// <summary>Every report, open first. Admins only.</summary>
    [HttpGet]
    [Authorize(Policy = AuthSetup.AdminPolicy)]
    [ProducesResponseType<IReadOnlyList<FeedbackResponse>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<FeedbackResponse>> List(CancellationToken ct) => feedback.ListAsync(ct);

    /// <summary>Marks a report done or dismissed, or opens it again. Admins only.</summary>
    [HttpPost("{id:guid}/status")]
    [Authorize(Policy = AuthSetup.AdminPolicy)]
    [ProducesResponseType<FeedbackResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetStatus(Guid id, [FromBody] FeedbackStatusChange? body, CancellationToken ct)
    {
        var status = body?.Status?.Trim() ?? "";
        if (!FeedbackValidator.Statuses.Contains(status))
        {
            return BadRequest(new ErrorResponse("Estado inválido."));
        }

        if (!await feedback.SetStatusAsync(id, status, AuthSetup.UserId(User), ct))
        {
            return NotFound(new ErrorResponse("Relatório não encontrado."));
        }

        return Ok(await feedback.GetAsync(id, ct));
    }
}
