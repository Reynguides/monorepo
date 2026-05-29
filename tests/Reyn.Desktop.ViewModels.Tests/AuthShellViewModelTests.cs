using FluentAssertions;
using Reyn.Application.Auth;
using Reyn.Desktop.ViewModels.Tests.Stubs;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests;

public sealed class AuthShellViewModelTests
{
    private static AuthShellViewModel Build(out StubAuthClient client, out InMemoryTokenStore store)
    {
        client = new StubAuthClient();
        store = new InMemoryTokenStore();
        var login = new LoginViewModel(client, store);
        var register = new RegisterViewModel(client, store);
        return new AuthShellViewModel(login, register);
    }

    [Fact]
    public void Defaults_to_login_active()
    {
        var shell = Build(out _, out _);
        shell.IsLoginActive.Should().BeTrue();
    }

    [Fact]
    public void ShowRegister_switches_active_view()
    {
        var shell = Build(out _, out _);
        shell.ShowRegisterCommand.Execute(null);
        shell.IsLoginActive.Should().BeFalse();
        shell.ShowLoginCommand.Execute(null);
        shell.IsLoginActive.Should().BeTrue();
    }

    [Fact]
    public async Task Successful_login_bubbles_to_shell_AuthSucceeded()
    {
        var shell = Build(out var client, out _);
        client.NextLoginResult = new AuthResult("u", "t", DateTime.UtcNow.AddHours(1));
        AuthResult? received = null;
        shell.AuthSucceeded += (_, r) => received = r;
        shell.Login.Email = "a";
        shell.Login.Password = "b";
        await shell.Login.SubmitCommand.ExecuteAsync(null);
        received!.UserId.Should().Be("u");
    }

    [Fact]
    public async Task Successful_register_bubbles_to_shell_AuthSucceeded()
    {
        var shell = Build(out var client, out _);
        client.NextRegisterResult = new AuthResult("u-new", "t", DateTime.UtcNow.AddHours(1));
        AuthResult? received = null;
        shell.AuthSucceeded += (_, r) => received = r;
        shell.Register.Email = "a";
        shell.Register.Password = "b";
        await shell.Register.SubmitCommand.ExecuteAsync(null);
        received!.UserId.Should().Be("u-new");
    }
}
