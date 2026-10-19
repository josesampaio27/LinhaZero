namespace LinhaZero.Api.Messaging;

/// <summary>NATS_URL. The default is the compose NATS from the host (IPv4: see <c>Pg.ConnectionString</c>).</summary>
public sealed class NatsOptions
{
    public string Url { get; set; } = "nats://127.0.0.1:4222";
}
