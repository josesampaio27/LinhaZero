namespace LinhaZero.Core.Sources;

/// <summary>
/// The typed content of one upstream response (an IPMA file, an Open-Meteo answer, the fogos.pt list). Ingest saves a
/// body only when it parses and is usable; the API reads the saved body back with the same <see cref="Parse"/>.
/// </summary>
public interface IUpstreamFile<TSelf> where TSelf : IUpstreamFile<TSelf>
{
    /// <summary>Reads the body; throws <see cref="System.Text.Json.JsonException"/> when its shape is wrong.</summary>
    static abstract TSelf Parse(string json);

    /// <summary>False when the body parsed but lacks what the parsers need; ingest then keeps the previous snapshot.</summary>
    bool IsUsable { get; }
}
