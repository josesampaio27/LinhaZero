namespace LinhaZero.Core.Sources;

/// <summary>
/// The newest saved copy of one source, as handed to the parsers: its data (null when there is none), when it was
/// fetched, whether it is stale, and the last error.
/// </summary>
public sealed record Snapshot<T>(T? Data, DateTime? FetchedAt, bool Stale, string? Error) where T : class
{
    public static Snapshot<T> Missing { get; } = new(null, null, true, "sem dados");

    public static Snapshot<T> Unavailable(string error) => new(null, null, true, error);
}
