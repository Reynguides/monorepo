namespace Reyn.Domain;

public class GameEvent
{
    public Guid EventId { get; set; }

    public string UserId { get; set; } = "";

    public string Type { get; set; } = "";

    public DateTime OccurredAt { get; set; }

    public string PayloadJson { get; set; } = "";

    public string ContentHash { get; set; } = "";

    public DateTime ReceivedAt { get; set; }
}
