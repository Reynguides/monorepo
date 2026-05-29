using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Reyn.Application.Abstractions;
using Reyn.Infrastructure.Auth;
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

        collection.AddDbContext<ReynDbContext>(o =>
            o.UseSqlite("Data Source=reyn-desktop.db"));

        collection.AddSingleton<ICurrentUserAccessor, StaticCurrentUserAccessor>();

        collection.AddHttpClient<ProxyService>();
        collection.AddHttpClient<SyncService>();

        Services = collection.BuildServiceProvider();

        // Phase 2: apply EF migrations on startup (replaces EnsureCreated()).
        using var scope = Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
        db.Database.Migrate();

        base.OnStartup(e);
    }
}
