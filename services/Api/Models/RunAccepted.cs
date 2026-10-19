namespace LinhaZero.Api.Models;

/// <summary>The 202 body of POST /api/v1/runs: the id generated for the run.</summary>
public sealed record RunAccepted(Guid RunId);
