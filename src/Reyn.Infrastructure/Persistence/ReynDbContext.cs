using Microsoft.EntityFrameworkCore;
using Reyn.Domain;
using Reyn.Infrastructure.Persistence.Configurations;

namespace Reyn.Infrastructure.Persistence;

public class ReynDbContext(DbContextOptions<ReynDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();

    public DbSet<Session> Sessions => Set<Session>();

    public DbSet<GameEvent> GameEvents => Set<GameEvent>();

    public DbSet<Achievement> Achievements => Set<Achievement>();

    public DbSet<PlaySession> PlaySessions => Set<PlaySession>();

    public DbSet<SyncOutboxEntry> SyncOutbox => Set<SyncOutboxEntry>();

    /// <summary>
    /// Legacy proxy-request log. Kept in Phase 2 so the live HTTP-forward
    /// path still works; retired in Phase 5 when <c>OutboxProcessor</c>
    /// replaces <c>SyncService</c>.
    /// </summary>
    public DbSet<RequestLog> Logs => Set<RequestLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new UserAccountConfiguration());
        modelBuilder.ApplyConfiguration(new SessionConfiguration());
        modelBuilder.ApplyConfiguration(new GameEventConfiguration());
        modelBuilder.ApplyConfiguration(new AchievementConfiguration());
        modelBuilder.ApplyConfiguration(new PlaySessionConfiguration());
        modelBuilder.ApplyConfiguration(new SyncOutboxEntryConfiguration());
        modelBuilder.ApplyConfiguration(new RequestLogConfiguration());
    }
}
