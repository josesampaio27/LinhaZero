using System.Text.Json.Serialization;
using LinhaZero.Core.Json;
using LinhaZero.Core.Sources;

namespace LinhaZero.Core.Weather.Ipma;

/// <summary>warnings_www.json: every weather warning, green included. Times have no offset and are UTC.</summary>
public sealed class IpmaWarningsFile : IUpstreamFile<IpmaWarningsFile>
{
    public required List<IpmaWarning> Warnings { get; init; }

    public bool IsUsable => Warnings.Count > 0;

    public static IpmaWarningsFile Parse(string json) => new() { Warnings = UpstreamJson.Deserialize<List<IpmaWarning>>(json) };
}

public sealed class IpmaWarning
{
    /// <summary>The warning area, for example "BRG" for Braga.</summary>
    [JsonPropertyName("idAreaAviso")]
    public string? Area { get; init; }

    /// <summary>green, yellow, orange or red.</summary>
    [JsonPropertyName("awarenessLevelID")]
    public string? Level { get; init; }

    [JsonPropertyName("awarenessTypeName")]
    public string? Type { get; init; }

    [JsonPropertyName("startTime")]
    public string? Start { get; init; }

    [JsonPropertyName("endTime")]
    public string? End { get; init; }

    [JsonPropertyName("text")]
    public string? Text { get; init; }
}
