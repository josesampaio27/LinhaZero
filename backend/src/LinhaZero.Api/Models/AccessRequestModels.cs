namespace LinhaZero.Api.Models;

/// <summary>
/// The POST /api/v1/access-requests body, from the landing's "Pedir acesso" form. <c>Website</c> is a trap: the form
/// hides it, so only bots fill it in, and their request is accepted and dropped.
/// </summary>
public sealed record AccessRequestCreate(string? Name, string? Email, string? Organization, string? OrganizationType, string? Message, string? Website);

/// <summary>An access request as the admin page shows it. Status: pending, approved or rejected.</summary>
public sealed record AccessRequestResponse(
    Guid Id,
    string Name,
    string Email,
    string Organization,
    string OrganizationType,
    string? Message,
    string Status,
    DateTime CreatedAt,
    DateTime? DecidedAt);
