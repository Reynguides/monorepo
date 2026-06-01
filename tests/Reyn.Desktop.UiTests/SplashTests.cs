using System.IO;
using System.Threading;
using FlaUI.UIA3;
using FluentAssertions;
using Reyn.Desktop.UiTests.Fixtures;
using Xunit;
using FlaUIApp = FlaUI.Core.Application;

namespace Reyn.Desktop.UiTests;

/// <summary>
/// The splash window flashes for ~600ms during cold start (no token →
/// immediate AuthShell). We capture it by racing the launch: spawn the
/// process and start polling immediately for a window containing the
/// <c>SplashStatus</c> automation id.
/// </summary>
[Trait("Category", "Auth")]
public sealed class SplashTests
{
    [Fact]
    public void Splash_window_appears_during_startup()
    {
        var authPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Reyn",
            "auth.bin");
        if (File.Exists(authPath))
        {
            File.Delete(authPath);
        }

        var exe = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
            "apps", "reyn-desktop", "bin", "Debug", "net8.0-windows", "Reyn.Desktop.exe"));
        File.Exists(exe).Should().BeTrue();

        var app = FlaUIApp.Launch(new System.Diagnostics.ProcessStartInfo(exe, "--screenshot-mode"));
        try
        {
            using var automation = new UIA3Automation();
            // Cold-start on a loaded CI runner (JIT + EF Migrate + host
            // StartAsync before splash.Show()) can exceed 8s; AuthFlowTests
            // already uses a 10s budget for the post-splash window, so give
            // the (earlier, transient) splash a generous margin.
            var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(20);
            while (DateTime.UtcNow < deadline)
            {
                foreach (var w in app.GetAllTopLevelWindows(automation))
                {
                    var splashStatus = w.FindFirstDescendant(cf => cf.ByAutomationId("SplashStatus"));
                    if (splashStatus is not null)
                    {
                        // Wait past the 400ms fade-in so the captured frame
                        // shows the fully-rendered card, not the still-
                        // transparent window over whatever's behind it.
                        Thread.Sleep(800);
                        var dir = Path.GetFullPath(Path.Combine(
                            AppContext.BaseDirectory, "..", "..", "..", "..", "..",
                            "docs", "ui", "screenshots"));
                        Directory.CreateDirectory(dir);
                        var capture = FlaUI.Core.Capturing.Capture.Element(w);
                        capture.ToFile(Path.Combine(dir, "splash.png"));
                        return;
                    }
                }
                Thread.Sleep(30);
            }
            throw new InvalidOperationException("Splash window never appeared within 20s");
        }
        finally
        {
            try { app.Close(); } catch (Exception) { }
        }
    }
}
