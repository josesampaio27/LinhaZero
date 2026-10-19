using LinhaZero.Core.Sources;

namespace LinhaZero.Api.Models;

/// <summary>The 503 body of GET /api/v1/weather when no source has a wind, with the state of each source.</summary>
public sealed record WeatherUnavailableResponse(string Error, List<SourceStatus> Sources);
