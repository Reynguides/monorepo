namespace Reyn.Infrastructure.Persistence;

public class RequestLog
{
    public int Id { get; set; }
    public string UserId { get; set; } = "";
    public string Method { get; set; } = "";
    public string Path { get; set; } = "";
    public int StatusCode { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public bool IsDeleted { get; set; }
    public DateTime? SyncedAt { get; set; }
}
