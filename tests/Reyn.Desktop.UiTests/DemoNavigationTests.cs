using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using FlaUI.Core.AutomationElements;
using FlaUI.UIA3;
using FluentAssertions;
using Xunit;
using FlaUIApp = FlaUI.Core.Application;

namespace Reyn.Desktop.UiTests;

/// <summary>
/// Launches the desktop with <c>--skip-auth --demo-mode</c> so the local DB
/// is seeded with 30 days of fixture data before MainShell renders. Captures
/// dashboard-charts / timeline-populated / achievements-progress /
/// events-filtered screenshots for the plan's Phase 8 evidence list.
/// </summary>
[Trait("Category", "Navigation")]
public sealed class DemoNavigationTests : IDisposable
{
    private readonly FlaUIApp _app;
    private readonly UIA3Automation _automation;
    private readonly string _screenshotDir;
    private readonly string _dbPath;

    public DemoNavigationTests()
    {
        // Reset the DB so the seeder runs every time the test class spins up
        // — Phase 8 demo-mode is idempotent (no-op when data exists) and we
        // need the populated state.
        _dbPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "apps", "reyn-desktop", "bin", "Debug", "net8.0-windows", "reyn-desktop.db"));
        if (File.Exists(_dbPath)) File.Delete(_dbPath);

        var exe = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "apps", "reyn-desktop", "bin", "Debug", "net8.0-windows", "Reyn.Desktop.exe"));
        File.Exists(exe).Should().BeTrue();

        _app = FlaUIApp.Launch(new ProcessStartInfo(exe, "--skip-auth --demo-mode"));
        _automation = new UIA3Automation();
        _screenshotDir = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "docs", "ui", "screenshots"));
        Directory.CreateDirectory(_screenshotDir);
        _app.WaitWhileBusy(TimeSpan.FromSeconds(10));
    }

    public void Dispose()
    {
        try { _app.Close(); } catch (Exception) { }
        _automation.Dispose();
    }

    [Fact]
    public void Dashboard_shows_populated_charts()
    {
        var shell = WaitForShellWithTitle("Dashboard")!;
        // The stat cards bind to TotalEvents/TotalPlaytimeMinutes/MaxLevel.
        // With demo data, all three are > 0; we don't assert specific numbers
        // because the seeder uses Random, but we assert the stat card AutomationId
        // is reachable (which proves the Ready surface rendered).
        shell.FindFirstDescendant(cf => cf.ByAutomationId("StatTotalEvents")).Should().NotBeNull();
        Capture(shell, "dashboard-charts.png");
    }

    [Fact]
    public void Timeline_shows_populated_sessions()
    {
        var shell = WaitForShellWithTitle("Dashboard")!;
        Navigate(shell, "NavTimeline");
        var afterNav = WaitForTitle(shell, "Timeline");
        afterNav.Should().NotBeNull();
        shell.FindFirstDescendant(cf => cf.ByAutomationId("TimelineList")).Should().NotBeNull();
        Capture(shell, "timeline-populated.png");
    }

    [Fact]
    public void Achievements_shows_progress_bars()
    {
        var shell = WaitForShellWithTitle("Dashboard")!;
        Navigate(shell, "NavAchievements");
        WaitForTitle(shell, "Achievements").Should().NotBeNull();
        shell.FindFirstDescendant(cf => cf.ByAutomationId("AchievementsList")).Should().NotBeNull();
        Capture(shell, "achievements-progress.png");
    }

    [Fact]
    public void Events_shows_filterable_list()
    {
        var shell = WaitForShellWithTitle("Dashboard")!;
        Navigate(shell, "NavEvents");
        WaitForTitle(shell, "Events").Should().NotBeNull();

        // VM tests cover chip-toggle behavior thoroughly (see
        // EventsViewModelTests); for the populated screenshot we just
        // verify the events list rendered.
        shell.FindFirstDescendant(cf => cf.ByAutomationId("EventsList"))
            .Should().NotBeNull();

        Capture(shell, "events-filtered.png");
    }

    private Window? WaitForShellWithTitle(string expectedTitle)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(15);
        while (DateTime.UtcNow < deadline)
        {
            foreach (var w in _app.GetAllTopLevelWindows(_automation))
            {
                var title = w.FindFirstDescendant(cf => cf.ByAutomationId("PageTitle"));
                if (title is not null && title.AsLabel().Text == expectedTitle)
                {
                    return w;
                }
            }
            Thread.Sleep(120);
        }
        return null;
    }

    private static AutomationElement? WaitForTitle(Window shell, string expected)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(3);
        while (DateTime.UtcNow < deadline)
        {
            var t = shell.FindFirstDescendant(cf => cf.ByAutomationId("PageTitle"));
            if (t is not null && t.AsLabel().Text == expected)
            {
                return t;
            }
            Thread.Sleep(80);
        }
        return null;
    }

    private static void Navigate(Window shell, string navId)
    {
        var navText = shell.FindFirstDescendant(cf => cf.ByAutomationId(navId));
        navText.Should().NotBeNull();
        var current = navText!.Parent;
        while (current is not null)
        {
            if (current.ControlType == FlaUI.Core.Definitions.ControlType.ListItem)
            {
                current.Patterns.SelectionItem.PatternOrDefault?.Select();
                return;
            }
            current = current.Parent;
        }
        navText.Click();
    }

    private void Capture(Window shell, string fileName)
    {
        var hwnd = shell.Properties.NativeWindowHandle.IsSupported
            ? shell.Properties.NativeWindowHandle.Value
            : IntPtr.Zero;
        if (hwnd != IntPtr.Zero)
        {
            SetForegroundWindow(hwnd);
            ShowWindow(hwnd, SW_MAXIMIZE);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            Thread.Sleep(400); // settle layout + charts
        }
        var path = Path.Combine(_screenshotDir, fileName);
        var capture = FlaUI.Core.Capturing.Capture.Element(shell);
        capture.ToFile(path);
        if (hwnd != IntPtr.Zero)
        {
            SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            ShowWindow(hwnd, SW_RESTORE);
        }
    }

    private const int SW_MAXIMIZE = 3;
    private const int SW_RESTORE = 9;
    private static readonly IntPtr HWND_TOPMOST = new(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new(-2);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOACTIVATE = 0x0010;

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
