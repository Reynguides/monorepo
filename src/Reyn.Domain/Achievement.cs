namespace Reyn.Domain;

public class Achievement
{
    public Guid Id { get; set; }

    public string UserId { get; set; } = "";

    public string Code { get; set; } = "";

    public bool Unlocked { get; set; }

    public int ProgressNumerator { get; set; }

    public int ProgressDenominator { get; set; }

    public DateTime? UnlockedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
