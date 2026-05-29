namespace Reyn.Domain;

public class UserAccount
{
    public Guid Id { get; set; }

    public string Email { get; set; } = "";

    public string PasswordHash { get; set; } = "";

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
