namespace LinhaZero.Api.Models;

/// <summary>The GET /api/v1/me body: who is signed in, as Keycloak named them.</summary>
public sealed record MeResponse(string Name, string? Email);
