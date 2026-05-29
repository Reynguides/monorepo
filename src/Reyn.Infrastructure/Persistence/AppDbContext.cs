using Microsoft.EntityFrameworkCore;

namespace Reyn.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<RequestLog> Logs => Set<RequestLog>();
}
