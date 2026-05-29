namespace Reyn.Application.Sync;

/// <summary>
/// What the UI binds to. <c>SyncStatus</c> (the enum in
/// <c>Reyn.Domain</c>) is per-row state; this is the *aggregate*: how many
/// rows are still outstanding, when we last successfully reached the server,
/// and the message attached to the last failure.
/// </summary>
public sealed record SyncSnapshot(
    int PendingCount,
    int DeadLetteredCount,
    DateTime? LastSuccessfulSyncAt,
    string? LastError);
