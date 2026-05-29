using System.IO;
using FlaUI.Core.AutomationElements;
using FlaUI.Core.Conditions;
using FlaUI.Core.Definitions;
using FlaUI.Core.WindowsAPI;
using FluentAssertions;
using Reyn.Desktop.UiTests.Fixtures;
using Xunit;

namespace Reyn.Desktop.UiTests;

[Trait("Category", "Auth")]
public sealed class AuthFlowTests : IDisposable
{
    private readonly AppFixture _fx;
    private readonly string _screenshotDir;

    public AuthFlowTests()
    {
        _fx = new AppFixture();
        _screenshotDir = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory, "..", "..", "..", "..", "..", "docs", "ui", "screenshots"));
        Directory.CreateDirectory(_screenshotDir);
    }

    public void Dispose() => _fx.Dispose();

    [Fact]
    public void Cold_start_shows_AuthShell_with_login_form()
    {
        var window = WaitForAuthShell();
        window.Should().NotBeNull("the app should land on AuthShell with no token on disk");

        var emailBox = window!.FindFirstDescendant(cf => cf.ByAutomationId("LoginEmail"));
        emailBox.Should().NotBeNull();

        var passwordBox = window.FindFirstDescendant(cf => cf.ByAutomationId("LoginPassword"));
        passwordBox.Should().NotBeNull();

        var submit = window.FindFirstDescendant(cf => cf.ByAutomationId("LoginSubmit"));
        submit.Should().NotBeNull();

        Capture(window, "login.png");
    }

    [Fact]
    public void Switching_to_register_shows_register_form()
    {
        var window = WaitForAuthShell()!;
        var showRegister = window.FindFirstDescendant(cf => cf.ByAutomationId("ShowRegisterButton"))!;
        showRegister.AsButton().Invoke();

        var emailBox = window.FindFirstDescendant(cf => cf.ByAutomationId("RegisterEmail"));
        emailBox.Should().NotBeNull("the register form should appear when 'Create account' is clicked");

        Capture(window, "register.png");
    }

    private Window? WaitForAuthShell()
    {
        // Splash window may be on screen first; wait until the AuthShell
        // (title "Reyn", non-splash) is the focused/main window.
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(10);
        while (DateTime.UtcNow < deadline)
        {
            var windows = _fx.Application.GetAllTopLevelWindows(_fx.Automation);
            foreach (var w in windows)
            {
                var hasLoginField = w.FindFirstDescendant(cf => cf.ByAutomationId("LoginEmail")) is not null;
                if (hasLoginField)
                {
                    return w;
                }
            }
            System.Threading.Thread.Sleep(150);
        }
        return null;
    }

    private void Capture(Window window, string fileName)
    {
        var path = Path.Combine(_screenshotDir, fileName);
        var capture = FlaUI.Core.Capturing.Capture.Element(window);
        capture.ToFile(path);
    }
}
