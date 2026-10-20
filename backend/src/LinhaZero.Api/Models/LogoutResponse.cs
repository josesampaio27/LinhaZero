namespace LinhaZero.Api.Models;

/// <summary>The POST /api/auth/logout body: the Keycloak address the browser goes to next, to end the login there too.</summary>
public sealed record LogoutResponse(string Redirect);
