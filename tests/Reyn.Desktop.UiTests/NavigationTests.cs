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
/// Click through every nav section without crashing. The app launches with
/// <c>--skip-auth</c> so we land straight on MainShell and don't need a
/// live Worker. Each section landing is captured as a PNG for the plan's
/// Phase 7 evidence checklist.
/// </summary>
[Trait("Category", "Navigation")]
public sealed class NavigationTests : IDisposable
{
    private readonly FlaUIApp _app;
    private readonly UIA3Automation _automation;
    private readonly string _screenshotDir;

    public NavigationTests()
    {
        var exe = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "apps", "reyn-desktop", "bin", "Debug", "net8.0-windows", "Reyn.Desktop.exe"));
        File.Exists(exe).Should().BeTrue();

        _app = FlaUIApp.Launch(new ProcessStartInfo(exe, "--skip-auth"));
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
    public void Lands_on_dashboard_by_default()
    {
        var shell = WaitForShell();
        shell.Should().NotBeNull("the app should land on MainShell after --skip-auth");

        var dashboard = shell!.FindFirstDescendant(cf => cf.ByAutomationId("NavDashboard"));
        dashboard.Should().NotBeNull();

        CaptureContent(shell, "dashboard-empty.png");
    }

    [Theory]
    [InlineData("NavTimeline", "Timeline", "timeline-empty.png")]
    [InlineData("NavAchievements", "Achievements", "achievements-empty.png")]
    [InlineData("NavEvents", "Events", "events-empty.png")]
    public void Navigation_to_section_changes_page_title(string navId, string expectedTitle, string screenshot)
    {
        var shell = WaitForShell()!;
        var navItem = shell.FindFirstDescendant(cf => cf.ByAutomationId(navId));
        navItem.Should().NotBeNull($"nav item {navId} should exist in the shell");

        InvokeNavItem(navItem!);

        // Poll the title up to ~2s — the ContentControl swap + layout pass
        // is not instantaneous.
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(2);
        AutomationElement? title = null;
        while (DateTime.UtcNow < deadline)
        {
            title = shell.FindFirstDescendant(cf => cf.ByAutomationId("PageTitle"));
            if (title is not null && title.AsLabel().Text == expectedTitle)
            {
                break;
            }
            Thread.Sleep(80);
        }
        title.Should().NotBeNull();
        title!.AsLabel().Text.Should().Be(expectedTitle, $"navigating to {navId} should show the {expectedTitle} title");

        CaptureContent(shell, screenshot);
    }

    [Fact]
    public void Sync_badge_navigates_to_settings()
    {
        var shell = WaitForShell()!;
        var badge = shell.FindFirstDescendant(cf => cf.ByAutomationId("SyncBadge"));
        badge.Should().NotBeNull();
        badge!.AsButton().Invoke();
        Thread.Sleep(120);

        var pageTitle = shell.FindFirstDescendant(cf => cf.ByAutomationId("PageTitle"));
        pageTitle.Should().NotBeNull();
        pageTitle!.AsLabel().Text.Should().Be("Settings");
    }

    private Window? WaitForShell()
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(12);
        while (DateTime.UtcNow < deadline)
        {
            foreach (var w in _app.GetAllTopLevelWindows(_automation))
            {
                if (w.FindFirstDescendant(cf => cf.ByAutomationId("MainShellWindow")) is not null
                    || w.FindFirstDescendant(cf => cf.ByAutomationId("NavDashboard")) is not null)
                {
                    return w;
                }
            }
            Thread.Sleep(120);
        }
        return null;
    }

    private static void InvokeNavItem(AutomationElement navText)
    {
        // The AutomationId is on the TextBlock inside the ListBox item
        // template; walk up to find the ListBoxItem, then use the UIA
        // SelectionItemPattern to mark it selected (drives the SelectedItem
        // two-way binding on the ListBox).
        var current = navText.Parent;
        while (current is not null)
        {
            if (current.ControlType == FlaUI.Core.Definitions.ControlType.ListItem)
            {
                var pattern = current.Patterns.SelectionItem.PatternOrDefault;
                if (pattern is not null)
                {
                    pattern.Select();
                    return;
                }
                current.AsListBoxItem().Select();
                return;
            }
            current = current.Parent;
        }
        // Fall back: click the text element directly. The click event
        // bubbles up to the ListBoxItem's selection logic.
        navText.Click();
    }

    private void CaptureContent(Window shell, string fileName)
    {
        // `Capture.Element` reads from the screen buffer at the window's
        // rectangle, so anything occluding the shell (terminal, IDE) leaks
        // into the PNG. Maximizing the window before capture forces it to
        // cover the whole screen — the screen buffer for our rectangle is
        // guaranteed to be ours. Restore afterwards so subsequent tests
        // aren't surprised by a maximized window.
        var hwnd = shell.Properties.NativeWindowHandle.IsSupported
            ? shell.Properties.NativeWindowHandle.Value
            : IntPtr.Zero;
        if (hwnd != IntPtr.Zero)
        {
            SetForegroundWindow(hwnd);
            ShowWindow(hwnd, SW_MAXIMIZE);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            Thread.Sleep(300);
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
