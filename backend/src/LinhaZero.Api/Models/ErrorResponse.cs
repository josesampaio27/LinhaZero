namespace LinhaZero.Api.Models;

/// <summary>Every 4xx/5xx body: a message in Portuguese, shown to the user as is.</summary>
public sealed record ErrorResponse(string Error);
