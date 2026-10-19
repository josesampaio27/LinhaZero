using System.Globalization;
using System.Text.Json;

namespace LinhaZero.Core.Json;

/// <summary>How the IPMA, Open-Meteo and fogos.pt bodies are read.</summary>
public static class UpstreamJson
{
    /// <summary>Case-insensitive names, and numbers that may come as strings ("40.6413" in distrits-islands.json).</summary>
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    /// <summary>Reads <paramref name="json"/> as <typeparamref name="T"/>; throws <see cref="JsonException"/> when the shape is wrong.</summary>
    public static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Options) ?? throw new JsonException($"empty body where {typeof(T).Name} was expected");

    public static T Deserialize<T>(JsonElement element) =>
        element.Deserialize<T>(Options) ?? throw new JsonException($"null where {typeof(T).Name} was expected");

    /// <summary>"2026-10-17T11:00" or "2026-10-17T11:00:00" without an offset, read as UTC (how IPMA and Open-Meteo send times).</summary>
    public static DateTime? ParseUtc(string? text)
    {
        const DateTimeStyles Utc = DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal;
        return DateTime.TryParse(text, CultureInfo.InvariantCulture, Utc, out var time) ? time : null;
    }
}
