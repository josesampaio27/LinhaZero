namespace LinhaZero.Core.Sources;

/// <summary>How fresh one data source is, as shown next to the data: when it was fetched, whether it is stale, and the last error.</summary>
public sealed record SourceStatus(string Name, DateTime? FetchedAt, bool Stale, string? Error)
{
    public static SourceStatus From<T>(string name, Snapshot<T> snapshot) where T : class =>
        new(name, snapshot.FetchedAt, snapshot.Stale, snapshot.Error);
}
