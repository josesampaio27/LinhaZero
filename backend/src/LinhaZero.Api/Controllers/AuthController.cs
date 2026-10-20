using LinhaZero.Api.Auth;
using LinhaZero.Api.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace LinhaZero.Api.Controllers;

/// <summary>
/// Login and logout. Browser navigations, not API calls, so they stay out of the OpenAPI document and the web client.
/// The callback (/api/auth/callback) is handled by the OpenID Connect middleware itself.
/// </summary>
[ApiController]
[Route("api/auth")]
[AllowAnonymous]
[ApiExplorerSettings(IgnoreApi = true)]
public sealed class AuthController(IConfiguration config) : ControllerBase
{
    /// <summary>Sends the browser to the Keycloak login, and back to <paramref name="returnUrl"/> (a path on this site) afterwards.</summary>
    [HttpGet("login")]
    public IActionResult Login(string? returnUrl)
    {
        var target = string.IsNullOrEmpty(returnUrl) ? "/" : returnUrl;
        if (!Url.IsLocalUrl(target))
        {
            return BadRequest(new ErrorResponse("returnUrl tem de ser um caminho desta aplicação"));
        }

        if (User.Identity?.IsAuthenticated == true)
        {
            return LocalRedirect(target);
        }

        return Challenge(new AuthenticationProperties { RedirectUri = target }, OpenIdConnectDefaults.AuthenticationScheme);
    }

    /// <summary>Ends the session here and answers with the Keycloak logout address (<see cref="LogoutResponse"/>).</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        if (User.Identity?.IsAuthenticated != true)
        {
            return Ok(new LogoutResponse(config["LANDING_URL"] ?? "/"));
        }

        // Read before the cookie is cleared: Keycloak needs the id_token to log out without asking "are you sure?".
        var properties = new AuthenticationProperties();
        properties.Items[AuthSetup.IdTokenItem] = await HttpContext.GetTokenAsync("id_token");
        return SignOut(properties, CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme);
    }
}
