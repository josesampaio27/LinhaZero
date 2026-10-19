namespace LinhaZero.Api.Messaging;

/// <summary>
/// Creates the RUNS stream in the background, so the API answers straight away even while NATS is still starting
/// (meanwhile /health and POST /runs answer 503, and the web runs in the browser).
/// </summary>
public sealed class NatsStreamSetup(RunQueue queue, ILogger<NatsStreamSetup> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await queue.EnsureStreamAsync(ct);
        log.LogInformation("Fila {Stream} pronta", RunQueue.Stream);
    }
}
