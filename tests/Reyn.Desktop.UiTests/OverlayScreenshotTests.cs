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
/// Captures the in-game overlay HUD. Launches with <c>--skip-auth --demo-mode</c>
/// — demo-mode forces the overlay visible without needing a real bg3.exe
/// process and seeds the mock generator so the ticker has events.
/// </summary>
[Trait("Category", "Navigation")]
public sealed class OverlayScreenshotTests : IDisposable
{
    private readonly FlaUIApp _app;
    private readonly UIA3Automation _automation;
    private readonly string _screenshotDir;

    public OverlayScreenshotTests()
    {
        var dbPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "apps", "reyn-desktop", "bin", "Debug", "net8.0-windows", "reyn-desktop.db"));
        if (File.Exists(dbPath)) File.Delete(dbPath);

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
    public void Overlay_renders_HUD_card_with_session_timer_party_rings_and_ticker()
    {
        var overlay = WaitForOverlay();
        overlay.Should().NotBeNull("--demo-mode forces the overlay visible at startup");

        overlay!.FindFirstDescendant(cf => cf.ByAutomationId("OverlayBrand")).Should().NotBeNull();
        overlay.FindFirstDescendant(cf => cf.ByAutomationId("OverlaySessionTimer")).Should().NotBeNull();
        overlay.FindFirstDescendant(cf => cf.ByAutomationId("OverlayPartyRings")).Should().NotBeNull();

        // Give the mock generator a couple of seconds to push events into
        // the ticker before capturing.
        Thread.Sleep(2500);
        Capture(overlay, "overlay-in-game.png");
    }

    private Window? WaitForOverlay()
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            foreach (var w in _app.GetAllTopLevelWindows(_automation))
            {
                if (w.FindFirstDescendant(cf => cf.ByAutomationId("OverlayBrand")) is not null)
                {
                    return w;
                }
            }
            Thread.Sleep(150);
        }
        return null;
    }

    private void Capture(Window window, string fileName)
    {
        var hwnd = window.Properties.NativeWindowHandle.IsSupported
            ? window.Properties.NativeWindowHandle.Value
            : IntPtr.Zero;
        if (hwnd != IntPtr.Zero)
        {
            SetForegroundWindow(hwnd);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            Thread.Sleep(400);
        }
        var path = Path.Combine(_screenshotDir, fileName);
        // The overlay window is maximized + transparent; capture the whole
        // window so the click-through HUD card in the bottom-right is shown
        // in context. Cropping to just the HUD via UIA bounds tends to pick
        // up occluding topmost apps (Telegram, IDE) because Capture reads
        // the screen buffer at the rect — Phase 11 can render the WPF
        // visual tree directly via RenderTargetBitmap for a pristine crop.
        var capture = FlaUI.Core.Capturing.Capture.Element(window);
        capture.ToFile(path);
        if (hwnd != IntPtr.Zero)
        {
            SetWindowPos(hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }

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
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
}
