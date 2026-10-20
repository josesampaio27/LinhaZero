using LinhaZero.Api.Auth;
using LinhaZero.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace LinhaZero.Api.Controllers;

[ApiController]
[Route("api/v1/me")]
public sealed class MeController : ControllerBase
{
    /// <summary>Who is signed in. 401 without a session: the web then sends the browser to the login.</summary>
    [HttpGet]
    [ProducesResponseType<MeResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ErrorResponse>(StatusCodes.Status401Unauthorized)]
    public MeResponse Get() => new(User.FindFirst("name")?.Value ?? "", User.FindFirst("email")?.Value, User.IsInRole(AuthSetup.AdminRole));
}
