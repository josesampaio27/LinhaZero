using System.Globalization;
using System.Text.Json;

namespace LinhaZero.Tests;

/// <summary>Real upstream bodies recorded once, each with the fetchedAt from its meta.json. No clock anywhere.</summary>
public static class Fixtures
{
    private static readonly string Dir = Path.Combine(AppContext.BaseDirectory, "fixtures");

    public static string Text(string name) => File.ReadAllText(Path.Combine(Dir, name + ".json"));

    /// <summary>The fixture as a fresh snapshot (not stale, no error), fetched at the time in its meta.json.</summary>
    public static Snapshot<T> Load<T>(string name) where T : class, IUpstreamFile<T> =>
        new(T.Parse(Text(name)), FetchedAt(name), Stale: false, Error: null);

    /// <summary>open-meteo.json is the answer for one point, the shape the API hands to the weather builder.</summary>
    public static Snapshot<OpenMeteoForecast> LoadForecast() =>
        new(UpstreamJson.Deserialize<OpenMeteoForecast>(Text("open-meteo")), FetchedAt("open-meteo"), Stale: false, Error: null);

    public static DateTime FetchedAt(string name)
    {
        using var meta = JsonDocument.Parse(File.ReadAllText(Path.Combine(Dir, name + ".meta.json")));
        var text = meta.RootElement.GetProperty("fetchedAt").GetString()!;
        return DateTime.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal);
    }
}
