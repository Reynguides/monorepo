namespace Reyn.Application.Sync;

/// <summary>
/// What the desktop sends to the Worker's <c>/v1/sync/push</c>. Field
/// ordering and naming mirror <c>ClientEvent</c> on the Worker side; the
/// JSON serializer respects property names with no special configuration.
/// </summary>
public sealed record EventPayload(
    Guid EventId,
    string Type,
    long OccurredAt,
    string PayloadJson);

/// <summary>
/// Server's reply to a push: how many new rows landed and how many were
/// dedup'd. The desktop uses <see cref="Accepted"/> + <see cref="Duplicates"/>
/// only to mark outbox rows synced — never to retry "rejected" events.
/// </summary>
public sealed record PushResult(int Accepted, int Duplicates);

/// <summary>
/// One server-stored event, plus its server-assigned <c>Cursor</c> (rowid)
/// for the next page request.
/// </summary>
public sealed record PullItem(
    Guid EventId,
    string Type,
    long OccurredAt,
    string PayloadJson,
    string ContentHash,
    long ReceivedAt,
    long Cursor);

public sealed record PullPage(IReadOnlyList<PullItem> Items, long? NextCursor);
