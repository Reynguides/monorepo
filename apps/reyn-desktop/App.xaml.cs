using System.Reflection;
using System.Windows;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Reyn.Application.Abstractions;
using Reyn.Application.Auth;
using Reyn.Application.Sync;
using Reyn.Desktop.ViewModels;
using Reyn.Desktop.ViewModels.Shell;
using Reyn.Desktop.Views.Auth;
using Reyn.Desktop.Views.Shell;
using Reyn.Desktop.Views.Splash;
using Reyn.Infrastructure.Auth;
using Reyn.Infrastructure.Http;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Sync;

namespace Reyn.Desktop;

public partial class App
{
    public static IServiceProvider Services { get; private set; } = null!;

    private IHost? _host;
    private SplashWindow? _splash;

    protected override async void OnStartup(StartupEventArgs e)
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

        await _host.StartAsync().ConfigureAwait(true);

        base.OnStartup(e);

        _splash = Services.GetRequiredService<SplashWindow>();
        _splash.Show();

        // --screenshot-mode holds the splash so FlaUI can capture it. The
        // splash is otherwise dismissed in <100ms on cold start, which is
        // too fast to race with UI automation.
        if (e.Args.Contains("--screenshot-mode", StringComparer.OrdinalIgnoreCase))
        {
            await Task.Delay(TimeSpan.FromSeconds(2)).ConfigureAwait(true);
        }

        var initialWindow = await ChooseInitialWindowAsync().ConfigureAwait(true);
        initialWindow.Show();
        _splash.Close();
        _splash = null;

        MainWindow = initialWindow;
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _host?.StopAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
        _host?.Dispose();
        base.OnExit(e);
    }

    /// <summary>
    /// Splash → session check → AuthShell (cold start or 401) or MainShell
    /// (verified session). Per the user-confirmed UX, the AuthShell defaults
    /// to LoginView. AuthShellViewModel raises AuthSucceeded to swap.
    ///
    /// The <c>--skip-auth</c> flag short-circuits straight to MainShell. It
    /// exists so FlaUI navigation tests can exercise the post-auth UI
    /// without needing a live Worker. Gated behind <c>#if DEBUG</c> so the
    /// branch is stripped from release builds — an auth-bypass code path
    /// MUST NOT exist in shipped binaries even if its functional impact is
    /// small (sync still rejects without a real token). Phase 11 will
    /// replace this with a WireMock-backed integration harness so the flag
    /// can be removed outright.
    /// </summary>
    private async Task<Window> ChooseInitialWindowAsync()
    {
#if DEBUG
        if (Environment.GetCommandLineArgs().Contains("--skip-auth", StringComparer.OrdinalIgnoreCase))
        {
            return Services.GetRequiredService<MainShell>();
        }
#endif

        var tokens = Services.GetRequiredService<IAuthTokenStore>();
        var stored = await tokens.LoadAsync(CancellationToken.None).ConfigureAwait(true);
        if (stored is null || stored.ExpiresAt <= DateTime.UtcNow)
        {
            return BuildAuthShell();
        }
        try
        {
            var client = Services.GetRequiredService<IAuthClient>();
            var me = await client.GetCurrentUserAsync(stored.Token, CancellationToken.None).ConfigureAwait(true);
            if (me is null)
            {
                await tokens.ClearAsync(CancellationToken.None).ConfigureAwait(true);
                return BuildAuthShell();
            }
            return Services.GetRequiredService<MainShell>();
        }
        catch (AuthException)
        {
            return BuildAuthShell();
        }
    }

    private AuthShellWindow BuildAuthShell()
    {
        var shell = Services.GetRequiredService<AuthShellWindow>();
        var vm = (AuthShellViewModel)shell.DataContext;
        vm.AuthSucceeded += OnAuthSucceeded;
        return shell;
    }

    private void OnAuthSucceeded(object? sender, AuthResult result)
    {
        if (sender is AuthShellViewModel vm)
        {
            vm.AuthSucceeded -= OnAuthSucceeded;
        }
        var main = Services.GetRequiredService<MainShell>();
        main.Show();
        var auth = MainWindow;
        MainWindow = main;
        auth?.Close();
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

        services.AddSingleton<DpapiTokenStore>();
        services.AddSingleton<IAuthTokenSource>(sp => sp.GetRequiredService<DpapiTokenStore>());
        services.AddSingleton<IAuthTokenStore>(sp => sp.GetRequiredService<DpapiTokenStore>());

        services.Configure<SyncOptions>(_ => { });
        services.AddHttpClient<IEventSyncClient, HttpEventSyncClient>();
        services.AddHttpClient<IAuthClient, HttpAuthClient>();

        services.AddHostedService<OutboxProcessor>();

        services.AddTransient<LoginViewModel>();
        services.AddTransient<RegisterViewModel>();
        services.AddTransient<AuthShellViewModel>();
        services.AddTransient(_ => new SplashViewModel
        {
            Version = Assembly.GetExecutingAssembly().GetName().Version?.ToString(3) ?? "0.0.0",
        });

        services.AddTransient<DashboardViewModel>();
        services.AddTransient<TimelineViewModel>();
        services.AddTransient<AchievementsViewModel>();
        services.AddTransient<EventsViewModel>();
        services.AddTransient<SettingsViewModel>();
        services.AddTransient<MainShellViewModel>();

        services.AddTransient<SplashWindow>();
        services.AddTransient<AuthShellWindow>();
        services.AddTransient<MainShell>();
        // MainWindow is the legacy overlay; Phase 9 reworks it into
        // OverlayWindow. Kept in DI so existing references still resolve.
        services.AddTransient<MainWindow>();
    }
}
