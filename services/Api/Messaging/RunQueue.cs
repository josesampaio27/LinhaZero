using System.Text.Json.Nodes;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace LinhaZero.Api.Messaging;

/// <summary>The RUNS work queue on NATS JetStream: the stream, the job publish and the count of idle workers.</summary>
public sealed class RunQueue(NatsConnection nats, NatsJSContext js, ILogger<RunQueue> log)
{
    public const string Stream = "RUNS";
    public const string JobsSubject = "runs.jobs";
    public const string Consumer = "engine";
    public static readonly StreamConfig StreamConfig = new(Stream, [JobsSubject])
    {
        Retention = StreamConfigRetention.Workqueue,
        Storage = StreamConfigStorage.File,
        DuplicateWindow = TimeSpan.FromMinutes(2),
    };

    public NatsConnectionState State => nats.ConnectionState;
    public bool IsConnected => nats.ConnectionState == NatsConnectionState.Open;

    /// <summary>Creates the stream if it does not exist, retrying until NATS answers (JetStream may be up after the container is healthy).</summary>
    public async Task EnsureStreamAsync(CancellationToken ct)
    {
        while (true)
        {
            try
            {
                await nats.ConnectAsync();
                try
                {
                    await js.GetStreamAsync(Stream, cancellationToken: ct);
                }
                catch (NatsJSApiException e) when (e.Error.Code == 404)
                {
                    await js.CreateStreamAsync(StreamConfig, ct);
                }
                return;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogWarning("NATS ainda não responde ({Error}); nova tentativa em 2 s", e.Message);
                await Task.Delay(2000, ct);
            }
        }
    }

    /// <summary>Publishes the job (5 s budget, ack checked); throws when the queue does not accept it.</summary>
    public async Task PublishAsync(Guid id, JsonObject job, CancellationToken ct)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(5));
        // Nats-Msg-Id only drops a duplicate of this same publish inside JetStream's 2-minute window.
        var ack = await js.PublishAsync(JobsSubject, job.ToJsonString(), opts: new NatsJSPubOpts { MsgId = id.ToString() }, cancellationToken: timeout.Token);
        ack.EnsureSuccess();
    }

    /// <summary>Waiting pull requests of the engine consumer: workers idle right now (a worker inside simulate is not counted). Never throws.</summary>
    public async Task<int> IdleWorkersAsync(CancellationToken ct)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(3));
            var consumer = await js.GetConsumerAsync(Stream, Consumer, timeout.Token);
            return (int)consumer.Info.NumWaiting;
        }
        catch (Exception e) when (!ct.IsCancellationRequested)
        {
            if (e is not NatsJSApiException) log.LogWarning("Consumer info indisponível: {Error}", e.Message); // the API exception is "no worker yet"
            return 0;
        }
    }
}
