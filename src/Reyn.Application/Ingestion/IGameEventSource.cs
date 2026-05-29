namespace Reyn.Application.Ingestion;

/// <summary>
/// One incoming event observed by some source — mock generator, socket
/// listener, or future BG3SE direct hook. Mirrors the wire shape on the
/// worker side (<c>ClientEventInput</c>): the desktop ingester sits between
/// this and EF Core, stamping <c>UserId</c> + <c>ReceivedAt</c> and
/// computing the content hash.
/// </summary>
public sealed record IncomingGameEvent(
    string Type,
    DateTime OccurredAt,
    string PayloadJson);

/// <summary>
/// Pull-style async stream of incoming events. Each source (mock, socket)
/// implements this; the desktop's <c>IngestionService</c> (Phase 9.5+)
/// composes them. <see cref="System.Threading.Channels"/> is the natural
/// fit for the composed channel.
/// </summary>
public interface IGameEventSource
{
    /// <summary>
    /// Yields events as they arrive. Should run until <paramref name="ct"/>
    /// is cancelled. Implementations are responsible for backoff /
    /// reconnect; the caller treats this as an infinite stream.
    /// </summary>
    IAsyncEnumerable<IncomingGameEvent> StreamAsync(CancellationToken ct);

    /// <summary>
    /// Stable identifier for the source ("mock", "socket", "bg3se"). Used
    /// as the <c>source</c> field on the event payload and in logs.
    /// </summary>
    string SourceName { get; }
}
