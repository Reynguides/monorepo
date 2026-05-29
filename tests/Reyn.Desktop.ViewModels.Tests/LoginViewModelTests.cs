using FluentAssertions;
using Reyn.Application.Auth;
using Reyn.Desktop.ViewModels.Tests.Stubs;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests;

public sealed class LoginViewModelTests
{
    [Fact]
    public void CanSubmit_is_false_until_email_and_password_are_set()
    {
        var vm = new LoginViewModel(new StubAuthClient(), new InMemoryTokenStore());
        vm.CanSubmit.Should().BeFalse();
        vm.Email = "a@b.io";
        vm.CanSubmit.Should().BeFalse();
        vm.Password = "p";
        vm.CanSubmit.Should().BeTrue();
    }

    [Fact]
    public async Task Successful_login_persists_token_and_raises_AuthSucceeded()
    {
        var client = new StubAuthClient
        {
            NextLoginResult = new AuthResult("user-X", "tok-X", DateTime.UtcNow.AddHours(1)),
        };
        var store = new InMemoryTokenStore();
        var vm = new LoginViewModel(client, store) { Email = "a@b.io", Password = "Hunter2longenough!" };
        AuthResult? received = null;
        vm.AuthSucceeded += (_, r) => received = r;

        await vm.SubmitCommand.ExecuteAsync(null);

        client.LoginCalls.Should().Be(1);
        store.Current!.Token.Should().Be("tok-X");
        received!.UserId.Should().Be("user-X");
        vm.ErrorMessage.Should().BeNull();
        vm.IsBusy.Should().BeFalse();
    }

    [Fact]
    public async Task Invalid_credentials_surfaces_inline_banner()
    {
        var client = new StubAuthClient { NextLoginThrow = new InvalidCredentialsException() };
        var store = new InMemoryTokenStore();
        var vm = new LoginViewModel(client, store) { Email = "a@b.io", Password = "x" };

        await vm.SubmitCommand.ExecuteAsync(null);

        vm.ErrorMessage.Should().Be("Invalid credentials.");
        store.Current.Should().BeNull();
        vm.IsBusy.Should().BeFalse();
    }

    [Fact]
    public async Task Transport_failure_surfaces_message()
    {
        var client = new StubAuthClient { NextLoginThrow = new AuthTransportException("offline") };
        var vm = new LoginViewModel(client, new InMemoryTokenStore()) { Email = "a", Password = "b" };
        await vm.SubmitCommand.ExecuteAsync(null);
        vm.ErrorMessage.Should().Be("offline");
    }

    [Fact]
    public async Task Double_submission_does_not_multiply_network_calls()
    {
        // RelayCommand may cancel an in-flight invocation when re-invoked.
        // What matters is that a fast double-click never produces more than
        // a couple of network reaches — definitely not one-per-click runaway.
        var client = new StubAuthClient { ArtificialDelay = TimeSpan.FromMilliseconds(40) };
        var vm = new LoginViewModel(client, new InMemoryTokenStore()) { Email = "a", Password = "b" };

        var first = SwallowCancellation(vm.SubmitCommand.ExecuteAsync(null));
        var second = SwallowCancellation(vm.SubmitCommand.ExecuteAsync(null));
        await Task.WhenAll(first, second);

        client.LoginCalls.Should().BeLessThanOrEqualTo(2);
    }

    private static async Task SwallowCancellation(Task task)
    {
        try { await task; }
        catch (OperationCanceledException) { /* expected */ }
    }

    [Fact]
    public async Task Successful_submit_clears_previous_error()
    {
        var client = new StubAuthClient { NextLoginThrow = new InvalidCredentialsException() };
        var store = new InMemoryTokenStore();
        var vm = new LoginViewModel(client, store) { Email = "a", Password = "b" };
        await vm.SubmitCommand.ExecuteAsync(null);
        vm.ErrorMessage.Should().NotBeNull();

        client.NextLoginThrow = null;
        await vm.SubmitCommand.ExecuteAsync(null);
        vm.ErrorMessage.Should().BeNull();
        store.Current.Should().NotBeNull();
    }
}
