namespace Reyn.Application.Sync;

/// <summary>
/// Transport-shaped contract between the desktop outbox and the Cloudflare
/// Worker. Implementations are responsible for translating HTTP failures into
/// the <see cref="SyncException"/> taxonomy so the outbox processor can stay
/// transport-agnostic.
/// </summary>
public interface IEventSyncClient
{
    /// <summary>
    /// Push a batch of events. <paramref name="idempotencyKey"/> is sent in
    /// the <c>Idempotency-Key</c> header; the server caches the response
    /// under (user, key) so a flaky retry returns the same result.
    /// </summary>
    Task<PushResult> PushAsync(
        IReadOnlyList<EventPayload> events,
        string idempotencyKey,
        CancellationToken ct);

    /// <summary>
    /// Pull events newer than <paramref name="sinceCursor"/>. Used for
    /// fresh-install rehydration. <paramref name="limit"/> ≤ 500 (server-enforced).
    /// </summary>
    Task<PullPage> PullAsync(long? sinceCursor, int limit, CancellationToken ct);
}
