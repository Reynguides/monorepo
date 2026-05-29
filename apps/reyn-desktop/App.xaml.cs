using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Reyn.Application.Abstractions;
using Reyn.Application.Sync;
using Reyn.Infrastructure.Auth;
using Reyn.Infrastructure.Http;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Sync;
using System.Windows;

namespace Reyn.Desktop;

public partial class App
{
    public static IServiceProvider Services { get; private set; } = null!;

    private IHost? _host;

    protected override void OnStartup(StartupEventArgs e)
    {
        _host = Host.CreateDefaultBuilder()
            .ConfigureLogging(lb => lb.ClearProviders())
            .ConfigureServices(ConfigureServices)
            .Build();

        Services = _host.Services;

        using (var scope = Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ReynDbContext>();
            db.Database.Migrate();
        }

        _host.Start();

        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _host?.StopAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
        _host?.Dispose();
        base.OnExit(e);
    }

    private static void ConfigureServices(HostBuilderContext _, IServiceCollection services)
    {
        services.AddSingleton<OutboxEnqueuingInterceptor>();

        services.AddDbContext<ReynDbContext>((sp, o) =>
            o.UseSqlite("Data Source=reyn-desktop.db")
             .AddInterceptors(sp.GetRequiredService<OutboxEnqueuingInterceptor>()));

        services.AddSingleton<ICurrentUserAccessor, StaticCurrentUserAccessor>();

        services.AddSingleton<EventSyncStatusPublisher>();
        services.AddSingleton<ISyncStatusPublisher>(sp => sp.GetRequiredService<EventSyncStatusPublisher>());
        services.AddSingleton<ISyncStatusWriter>(sp => sp.GetRequiredService<EventSyncStatusPublisher>());

        services.AddSingleton<StaticAuthTokenSource>();
        services.AddSingleton<IAuthTokenSource>(sp => sp.GetRequiredService<StaticAuthTokenSource>());

        services.Configure<SyncOptions>(_ => { });
        services.AddHttpClient<IEventSyncClient, HttpEventSyncClient>();

        services.AddHostedService<OutboxProcessor>();
    }
}
