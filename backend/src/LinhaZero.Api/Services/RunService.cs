using System.Text.Json.Nodes;
using LinhaZero.Api.Messaging;
using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;

namespace LinhaZero.Api.Services;

/// <summary>Server runs: queue a validated request, then read its state and rasters.</summary>
public sealed class RunService(RunRepository runs, RunQueue queue, ILogger<RunService> log)
{
    public const string QueueUnavailable = "fila indisponível";

    /// <summary>
    /// Inserts the queued row and publishes the job. False, with the row failed, when the queue is unavailable: the caller
    /// answers 503 and the web falls back to the browser. Nothing is inserted while NATS is down. <paramref name="userId"/>
    /// is who started it, for the history.
    /// </summary>
    public async Task<bool> EnqueueAsync(Guid id, JsonObject request, Guid? userId, CancellationToken ct)
    {
        if (!queue.IsConnected)
        {
            log.LogWarning("POST /runs com o NATS em estado {State}: 503", queue.State);
            return false;
        }
        await runs.InsertQueuedAsync(id, request.ToJsonString(), userId, ct);
        request["runId"] = id.ToString();
        try
        {
            await queue.PublishAsync(id, request, ct);
            return true;
        }
        catch (Exception e) when (!ct.IsCancellationRequested)
        {
            log.LogError(e, "Publicação de {RunId} em runs.jobs falhou; linha marcada failed", id);
            await runs.MarkFailedAsync(id, QueueUnavailable, CancellationToken.None);
            return false;
        }
    }

    public Task<RunStatusResponse?> GetAsync(Guid id, CancellationToken ct) => runs.GetAsync(id, ct);

    public Task<IReadOnlyList<RunSummary>> ListAsync(Guid? userId, int limit, CancellationToken ct) => runs.ListAsync(userId, limit, ct);

    public Task<string?> ScenarioAsync(Guid id, Guid? userId, CancellationToken ct) => runs.ScenarioAsync(id, userId, ct);

    public Task<byte[]?> RasterAsync(Guid id, string decision, string layer, CancellationToken ct) => runs.RasterAsync(id, decision, layer, ct);
}
