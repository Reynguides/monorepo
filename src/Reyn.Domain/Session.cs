namespace Reyn.Domain;

public class Session
{
    public Guid Id { get; set; }

    public Guid UserAccountId { get; set; }

    public string TokenHash { get; set; } = "";

    public DateTime ExpiresAt { get; set; }

    public DateTime CreatedAt { get; set; }
}
