using LinhaZero.Api.Auth;
using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Services;
using LinhaZero.Api.Validation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace LinhaZero.Api.Controllers;

/// <summary>
/// "Pedir acesso" (docs/decisoes/0062): anyone can ask from the landing; an admin (Keycloak role linhazero-admin)
/// lists the requests in the app and approves them, which creates the account and emails the invite.
/// </summary>
[ApiController]
[Route("api/v1/access-requests")]
public sealed class AccessRequestsController(AccessRequestRepository requests, IKeycloakAdmin keycloak, ILogger<AccessRequestsController> log)
    : ControllerBase
{
    /// <summary>A request from the landing. 202 whatever happens next: the answer never says whether an email is known.</summary>
    /// <remarks>Public, from the landing's address only (CORS), at most 5 per hour from one address.</remarks>
    [HttpPost]
    [AllowAnonymous]
    [EnableCors(AuthSetup.LandingCors)]
    [EnableRateLimiting(AuthSetup.AccessRequestLimit)]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Create([FromBody] AccessRequestCreate? body, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(body?.Website))
        {
            log.LogInformation("Pedido de acesso descartado (campo-armadilha preenchido)");
            return Accepted();
        }

        var (request, error) = AccessRequestValidator.Validate(body);
        if (request is null)
        {
            return BadRequest(new ErrorResponse(error!));
        }

        await requests.InsertAsync(request, ct);
        log.LogInformation("Pedido de acesso de {Organization} ({Type})", request.Organization, request.OrganizationType);
        return Accepted();
    }

    /// <summary>Every request, pending first. Admins only.</summary>
    [HttpGet]
    [Authorize(Policy = AuthSetup.AdminPolicy)]
    [ProducesResponseType<IReadOnlyList<AccessRequestResponse>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<AccessRequestResponse>> List(CancellationToken ct) => requests.ListAsync(ct);

    /// <summary>Creates the account in Keycloak and emails the invite (a link to set the password). Admins only.</summary>
    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = AuthSetup.AdminPolicy)]
    [ProducesResponseType<AccessRequestResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status409Conflict)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status502BadGateway)]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var request = await requests.GetAsync(id, ct);
        if (request is null)
        {
            return NotFound(new ErrorResponse("Pedido não encontrado."));
        }

        if (request.Status != "pending")
        {
            return Conflict(new ErrorResponse("Este pedido já foi respondido."));
        }

        string userId;
        try
        {
            userId = await keycloak.InviteAsync(request.Email, request.Name, ct);
        }
        catch (Exception e) when (e is KeycloakAdminException or HttpRequestException)
        {
            log.LogError(e, "Aprovar o pedido {Id} falhou no Keycloak", id);
            return StatusCode(StatusCodes.Status502BadGateway, new ErrorResponse(e is KeycloakAdminException ? e.Message : "O Keycloak não respondeu."));
        }

        await requests.DecideAsync(id, "approved", AuthSetup.UserId(User), userId, ct);
        return Ok(await requests.GetAsync(id, ct));
    }

    /// <summary>Refuses the request; no account and no email (answer the person directly if needed). Admins only.</summary>
    [HttpPost("{id:guid}/reject")]
    [Authorize(Policy = AuthSetup.AdminPolicy)]
    [ProducesResponseType<AccessRequestResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Reject(Guid id, CancellationToken ct)
    {
        if (await requests.GetAsync(id, ct) is not { } request)
        {
            return NotFound(new ErrorResponse("Pedido não encontrado."));
        }

        if (request.Status != "pending" || !await requests.DecideAsync(id, "rejected", AuthSetup.UserId(User), null, ct))
        {
            return Conflict(new ErrorResponse("Este pedido já foi respondido."));
        }

        return Ok(await requests.GetAsync(id, ct));
    }
}
