using System.Reflection;
using System.Windows;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Reyn.Application.Abstractions;
using Reyn.Application.Auth;
using Reyn.Application.Ingestion;
using Reyn.Application.Queries;
using Reyn.Application.Sync;
using Reyn.Desktop.ViewModels;
using Reyn.Desktop.ViewModels.Overlay;
using Reyn.Desktop.ViewModels.Shell;
using Reyn.Desktop.Views.Auth;
using Reyn.Desktop.Views.Overlay;
using Reyn.Desktop.Views.Shell;
using Reyn.Desktop.Views.Splash;
using Reyn.Infrastructure.Auth;
using Reyn.Infrastructure.Demo;
using Reyn.Infrastructure.Http;
using Reyn.Infrastructure.Ingestion;
using Reyn.Infrastructure.Persistence;
using Reyn.Infrastructure.Queries;
using Reyn.Infrastructure.Sync;

namespace Reyn.Desktop;

// App.xaml.cs is pure DI + window-lifecycle wiring. Its behaviour is
// integration-tested by the FlaUI suite which launches the real exe;
// coverlet's in-process collection doesn't observe the separate
// process. Excluded explicitly per ADR-0004's WPF carve-out.
[System.Diagnostics.CodeAnalysis.ExcludeFromCodeCoverage]
public partial class App
{
    public static IServiceProvider Services { get; private set; } = null!;

    private IHost? _host;
    private SplashWindow? _splash;
    private OverlayWindow? _overlay;

    // `_forceOverlayVisible` is only ever assigned from the --demo-mode branch
    // below, which is itself #if DEBUG-gated. In Release the field would be
    // declared but never written → CS0649 under -warnaserror. Folding it to a
    // compile-time `const false` in Release lets the read sites stay verbatim
    // while the JIT drops the always-false branches.
#if DEBUG
    private bool _forceOverlayVisible;
#else
    private const bool _forceOverlayVisible = false;
#endif

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

#if DEBUG
        // --demo-mode seeds fixture data so charts/timeline/achievements/events
        // pages render populated screenshots without a real BG3 session.
        // DEBUG-gated so it cannot run in release binaries — same pattern as
        // --skip-auth (see PR #8 / feedback-debug-gate-test-only-cli-flags).
        if (e.Args.Contains("--demo-mode", StringComparer.OrdinalIgnoreCase))
        {
            using var seedScope = Services.CreateScope();
            var seeder = seedScope.ServiceProvider.GetRequiredService<DemoDataSeeder>();
            await seeder.SeedAsync(CancellationToken.None).ConfigureAwait(true);
            _forceOverlayVisible = true;
        }
#endif

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

        WireOverlayLifecycle();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _overlay?.Close();
        _host?.StopAsync(TimeSpan.FromSeconds(5)).GetAwaiter().GetResult();
        _host?.Dispose();
        base.OnExit(e);
    }

    /// <summary>
    /// Per the AskUserQuestion answer, the overlay shows only while BG3 is
    /// running. The publisher fires on a 2s cadence (Bg3ProcessDetectorService);
    /// each state change runs through this on the Dispatcher to show/hide
    /// the click-through HUD window.
    ///
    /// <c>--demo-mode</c> forces the overlay visible at startup so FlaUI can
    /// screenshot it without needing a live BG3 process.
    /// </summary>
    private void WireOverlayLifecycle()
    {
        var detection = Services.GetRequiredService<IBg3DetectionPublisher>();
        detection.Changed += (_, state) => Dispatcher.Invoke(() => ApplyOverlayVisibility(state.IsDetected));

        if (_forceOverlayVisible || detection.Current.IsDetected)
        {
            ApplyOverlayVisibility(true);
        }
    }

    private void ApplyOverlayVisibility(bool visible)
    {
        if (visible)
        {
            if (_overlay is null)
            {
                _overlay = Services.GetRequiredService<OverlayWindow>();
                _overlay.Closed += (_, _) => _overlay = null;
                _overlay.Show();
            }
        }
        else if (_overlay is not null && !_forceOverlayVisible)
        {
            _overlay.Close();
            _overlay = null;
        }
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

    private void ConfigureServices(HostBuilderContext _, IServiceCollection services)
    {
        services.AddSingleton<OutboxEnqueuingInterceptor>();

        // AddDbContext for the outbox processor's scoped context; AddDbContextFactory
        // for the page query service which creates fresh short-lived contexts so
        // transient ViewModels don't smuggle a captive scope.
        services.AddDbContext<ReynDbContext>((sp, o) =>
            o.UseSqlite("Data Source=reyn-desktop.db")
             .AddInterceptors(sp.GetRequiredService<OutboxEnqueuingInterceptor>()));
        services.AddDbContextFactory<ReynDbContext>((sp, o) =>
            o.UseSqlite("Data Source=reyn-desktop.db")
             .AddInterceptors(sp.GetRequiredService<OutboxEnqueuingInterceptor>()),
            lifetime: ServiceLifetime.Singleton);

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

        services.AddTransient<IGameEventQueryService, GameEventQueryService>();
        services.AddScoped<DemoDataSeeder>();

        services.AddHostedService<OutboxProcessor>();

        // Phase 9 — ingestion + detection.
        ConfigureIngestionServices(services);

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

        services.AddSingleton<OverlayViewModel>();
        services.AddSingleton<OverlayWindow>();
    }

    private static void ConfigureIngestionServices(IServiceCollection services)
    {
        services.AddSingleton<IGameDetector, Bg3ProcessDetector>();
        services.AddSingleton<Bg3DetectionPublisher>();
        services.AddSingleton<IBg3DetectionPublisher>(sp => sp.GetRequiredService<Bg3DetectionPublisher>());
        services.AddSingleton<IBg3DetectionWriter>(sp => sp.GetRequiredService<Bg3DetectionPublisher>());
        services.Configure<Bg3DetectionOptions>(_ => { });
        services.AddHostedService<Bg3ProcessDetectorService>();

        services.Configure<MockEventGeneratorOptions>(_ => { });
        services.Configure<Bg3FileEventSourceOptions>(_ => { });

#if DEBUG
        // In demo mode, run the mock generator instead of the real socket
        // / file sources so the overlay ticker has events to display
        // without a BG3SE Lua mod connecting.
        if (Environment.GetCommandLineArgs().Contains("--demo-mode", StringComparer.OrdinalIgnoreCase))
        {
            services.AddSingleton<IGameEventSource, MockBg3EventGenerator>();
            return;
        }
#endif
        // Production: file source (Phase 10 mod output) + socket source
        // (external producers, future native shim). The overlay window
        // consumes IEnumerable<IGameEventSource> and starts a reader per
        // source; both feed the same ticker + outbox pipeline.
        services.AddSingleton<IGameEventSource, Bg3FileEventSource>();
        services.AddSingleton<IGameEventSource, Bg3SocketEventSource>();
    }
}
