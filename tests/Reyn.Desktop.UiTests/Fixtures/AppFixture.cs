using System.IO;
using FlaUI.UIA3;
using FlaUIApp = FlaUI.Core.Application;

namespace Reyn.Desktop.UiTests.Fixtures;

/// <summary>
/// Launches the desktop app from its compiled artifact, waits for a UI
/// surface to materialize, and tears it down on dispose. Tests cooperate
/// by being marked <c>[Trait("Category","Auth")]</c> so the Phase 11 CI
/// matrix can opt them out on non-Windows runners.
/// </summary>
public sealed class AppFixture : IDisposable
{
    public FlaUIApp Application { get; }

    public UIA3Automation Automation { get; }

    public AppFixture()
    {
        DeleteStoredAuth();
        var exe = LocateDesktopExe();
        Application = FlaUIApp.Launch(exe);
        Automation = new UIA3Automation();
        Application.WaitWhileBusy(TimeSpan.FromSeconds(10));
    }

    public void Dispose()
    {
        try
        {
            Application.Close();
        }
        catch (Exception)
        {
            // App may have already exited.
        }
        Automation.Dispose();
    }

    /// <summary>
    /// Resolves <c>Reyn.Desktop.exe</c> next to this test assembly. Both
    /// projects compile to the same configuration folder when built from
    /// the solution.
    /// </summary>
    private static string LocateDesktopExe()
    {
        var here = AppContext.BaseDirectory;
        // here: .../tests/Reyn.Desktop.UiTests/bin/Debug/net8.0-windows/
        // target: .../apps/reyn-desktop/bin/Debug/net8.0-windows/Reyn.Desktop.exe
        var repoRoot = Path.GetFullPath(Path.Combine(here, "..", "..", "..", "..", ".."));
        var candidate = Path.Combine(repoRoot, "apps", "reyn-desktop", "bin", "Debug", "net8.0-windows", "Reyn.Desktop.exe");
        if (!File.Exists(candidate))
        {
            throw new FileNotFoundException($"Expected Reyn.Desktop.exe at {candidate}. Build the solution before running UI tests.");
        }
        return candidate;
    }

    private static void DeleteStoredAuth()
    {
        var authPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Reyn",
            "auth.bin");
        if (File.Exists(authPath))
        {
            File.Delete(authPath);
        }
    }
}
