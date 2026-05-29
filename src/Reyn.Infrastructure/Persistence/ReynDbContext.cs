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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new UserAccountConfiguration());
        modelBuilder.ApplyConfiguration(new SessionConfiguration());
        modelBuilder.ApplyConfiguration(new GameEventConfiguration());
        modelBuilder.ApplyConfiguration(new AchievementConfiguration());
        modelBuilder.ApplyConfiguration(new PlaySessionConfiguration());
        modelBuilder.ApplyConfiguration(new SyncOutboxEntryConfiguration());
    }
}
