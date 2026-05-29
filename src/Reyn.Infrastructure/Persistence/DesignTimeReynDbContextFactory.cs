using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Reyn.Infrastructure.Persistence;

/// <summary>
/// Lets <c>dotnet ef</c> instantiate <see cref="ReynDbContext"/> at design
/// time without invoking the WPF startup project. EF Core discovers this
/// class by convention.
/// </summary>
public sealed class DesignTimeReynDbContextFactory : IDesignTimeDbContextFactory<ReynDbContext>
{
    public ReynDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<ReynDbContext>()
            .UseSqlite("Data Source=reyn-design-time.db")
            .Options;
        return new ReynDbContext(options);
    }
}
