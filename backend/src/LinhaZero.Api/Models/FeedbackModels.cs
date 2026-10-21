namespace LinhaZero.Api.Models;

/// <summary>
/// The POST /api/v1/feedback body: a problem or a suggestion from a signed-in user. Kind: bug, suggestion or other.
/// <c>MayContact</c>: the team may answer by email (the address comes from the session).
/// </summary>
public sealed record FeedbackCreate(string? Kind, string? Message, bool MayContact, FeedbackContext? Context);

/// <summary>Where the person was when they wrote, filled in by the web; every field optional.</summary>
public sealed record FeedbackContext(string? Page, string? Scenario, string? Variant, string? AppVersion, string? UserAgent, string? Viewport);

/// <summary>The POST /api/v1/feedback/{id}/status body. Status: open, done or dismissed.</summary>
public sealed record FeedbackStatusChange(string? Status);

/// <summary>A report as the admin page shows it, with who sent it.</summary>
public sealed record FeedbackResponse(
    Guid Id,
    string Kind,
    string Message,
    bool MayContact,
    FeedbackContext Context,
    string Status,
    DateTime CreatedAt,
    DateTime? ClosedAt,
    string UserName,
    string? UserEmail);
