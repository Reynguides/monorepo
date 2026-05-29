using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Reyn.Infrastructure.Http;
using Reyn.Infrastructure.Persistence;
using System.Windows;

namespace Reyn.Desktop;

public partial class App
{
    public static IServiceProvider Services { get; private set; } = null!;

    protected override void OnStartup(StartupEventArgs e)
    {
        var collection = new ServiceCollection();

        collection.AddDbContext<AppDbContext>(o =>
            o.UseSqlite("Data Source=proxy.db"));

        collection.AddHttpClient<ProxyService>();
        collection.AddHttpClient<SyncService>();

        Services = collection.BuildServiceProvider();

        // Phase 2 replaces EnsureCreated() with Migrate().
        using var scope = Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();

        base.OnStartup(e);
    }
}
