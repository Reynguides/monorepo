namespace Reyn.Domain;

public enum SyncStatus
{
    Pending = 0,
    Synced = 1,
    DeadLettered = 2,
}

public class SyncOutboxEntry
{
    public Guid EventId { get; set; }

    public string PayloadHash { get; set; } = "";

    public int Attempts { get; set; }

    public string? LastError { get; set; }

    public DateTime? NextAttemptAt { get; set; }

    public SyncStatus Status { get; set; }

    public DateTime CreatedAt { get; set; }
}
