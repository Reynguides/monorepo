namespace Reyn.Domain;

public class PlaySession
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = "";

    public DateTime StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }

    public int EventCount { get; set; }

    public DateTime UpdatedAt { get; set; }
}
