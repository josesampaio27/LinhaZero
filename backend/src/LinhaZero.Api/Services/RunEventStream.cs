using System.Net.ServerSentEvents;
using System.Runtime.CompilerServices;
using System.Text.Json;
using LinhaZero.Api.Models;
using LinhaZero.Api.Repositories;
using LinhaZero.Api.Validation;
using NATS.Client.Core;

namespace LinhaZero.Api.Services;

/// <summary>
/// The progress of a run as Server-Sent Events. The engine worker publishes each event on the NATS subject
/// runs.&lt;id&gt;.events; this relays them to the browser until the run is done or failed.
/// </summary>
public sealed class RunEventStream(RunRepository runs, NatsConnection nats)
{
    /// <summary>Sent while nothing happens, so proxies do not close an idle connection.</summary>
    public static readonly TimeSpan DefaultHeartbeat = TimeSpan.FromSeconds(15);

    public async IAsyncEnumerable<SseItem<string>> EventsAsync(Guid id, [EnumeratorCancellation] CancellationToken ct, TimeSpan? heartbeat = null)
    {
        // Subscribe before reading the row, so an event published in between is never lost. The ping is a round trip:
        // when it returns, the server has registered the subscription.
        await using var subscription = await nats.SubscribeCoreAsync<string>($"runs.{id}.events", cancellationToken: ct);
        await nats.PingAsync(ct);

        var run = await runs.GetAsync(id, ct);
        var current = CurrentState(run);
        yield return ToSse(current);
        if (current.Type is "done" or "failed")
        {
            yield break;
        }

        await foreach (var item in RelayAsync(subscription, heartbeat ?? DefaultHeartbeat, ct))
        {
            yield return item;
        }
    }

    /// <summary>What the browser should know at connect time: an unknown run fails, a finished one ends the stream.</summary>
    private static RunEvent CurrentState(RunStatusResponse? run) => run switch
    {
        null => new RunEvent("failed", Error: "corrida desconhecida"),
        { Status: "done" } => new RunEvent("done"),
        { Status: "failed" } => new RunEvent("failed", Error: run.Error ?? "falhou"),
        _ => new RunEvent("progress", run.Status, run.Progress, Total: 2),
    };

    /// <summary>
    /// Forwards each event as it arrives, with a ping after every quiet heartbeat. One pending read is kept across
    /// pings, so no event is consumed by a read that was abandoned.
    /// </summary>
    private static async IAsyncEnumerable<SseItem<string>> RelayAsync(
        INatsSub<string> subscription, TimeSpan heartbeat, [EnumeratorCancellation] CancellationToken ct)
    {
        Task<bool>? pendingRead = null;
        while (true)
        {
            pendingRead ??= subscription.Msgs.WaitToReadAsync(ct).AsTask();
            var first = await Task.WhenAny(pendingRead, Task.Delay(heartbeat, ct));
            if (first != pendingRead)
            {
                yield return new SseItem<string>("", "ping");
                continue;
            }

            var subscriptionOpen = await pendingRead;
            pendingRead = null;
            if (!subscriptionOpen)
            {
                yield break;
            }

            while (subscription.Msgs.TryRead(out var message))
            {
                var data = message.Data ?? "";
                if (TryReadEvent(data) is not { } runEvent)
                {
                    continue;
                }

                yield return new SseItem<string>(data, runEvent.Type);
                if (runEvent.Type is "done" or "failed")
                {
                    yield break;
                }
            }
        }
    }

    /// <summary>The event in a message, or null for anything that is not a run event (it is skipped).</summary>
    private static RunEvent? TryReadEvent(string data)
    {
        try
        {
            return JsonSerializer.Deserialize<RunEvent>(data, RunRequestParser.Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static SseItem<string> ToSse(RunEvent runEvent) => new(JsonSerializer.Serialize(runEvent, RunRequestParser.Json), runEvent.Type);
}
