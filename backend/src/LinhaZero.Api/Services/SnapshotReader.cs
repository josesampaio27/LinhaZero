using System.Collections.Concurrent;
using LinhaZero.Core.Database;
using LinhaZero.Core.Sources;
using Microsoft.Extensions.Options;

namespace LinhaZero.Api.Services;

/// <summary>
/// The newest snapshot of a source, parsed into its typed model. Parsed data is cached per (source, key) and reused
/// while the newest row id stays the same: snapshot rows are never updated, so the cache can never be wrong.
/// </summary>
public sealed class SnapshotReader(SnapshotStore store, IOptions<SourceOptions> sources)
{
    private readonly ConcurrentDictionary<(string Source, string Key), CachedFile> _cache = new();

    /// <summary>
    /// Stale when the newest pull failed after the last success, or when the snapshot is older than twice the
    /// source's pull interval. The error is reported only while the failure is newer than the last success.
    /// </summary>
    public async Task<Snapshot<T>> LatestAsync<T>(string source, string key, DateTime now, CancellationToken ct)
        where T : class, IUpstreamFile<T>
    {
        var latest = await store.LatestAsync(source, key, ct);
        var status = await store.StatusAsync(source, key, ct);
        var failed = status is { FailedSinceLastSuccess: true };

        if (latest is null)
        {
            return Snapshot<T>.Unavailable(status?.LastError ?? "sem dados");
        }

        var tooOld = now - latest.FetchedAt > 2 * sources.Value.Interval(source);
        var data = await ReadAsync<T>(source, key, latest.Id, ct);
        return new Snapshot<T>(data, latest.FetchedAt, Stale: failed || tooOld, failed ? status!.LastError : null);
    }

    private async Task<T> ReadAsync<T>(string source, string key, long id, CancellationToken ct)
        where T : class, IUpstreamFile<T>
    {
        if (_cache.TryGetValue((source, key), out var cached) && cached.Id == id && cached.Data is T hit)
        {
            return hit;
        }

        var data = T.Parse(await store.BodyAsync(id, ct));
        _cache[(source, key)] = new CachedFile(id, data);
        return data;
    }

    private sealed record CachedFile(long Id, object Data);
}
