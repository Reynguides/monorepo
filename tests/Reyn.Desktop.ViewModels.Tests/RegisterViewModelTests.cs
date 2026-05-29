using FluentAssertions;
using Reyn.Application.Auth;
using Reyn.Desktop.ViewModels.Tests.Stubs;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests;

public sealed class RegisterViewModelTests
{
    [Fact]
    public async Task Successful_register_persists_token_and_raises_AuthSucceeded()
    {
        var client = new StubAuthClient
        {
            NextRegisterResult = new AuthResult("u-new", "tok-new", DateTime.UtcNow.AddHours(1)),
        };
        var store = new InMemoryTokenStore();
        var vm = new RegisterViewModel(client, store)
        {
            Email = "new@example.com",
            Password = "Hunter2longenough!",
        };
        AuthResult? received = null;
        vm.AuthSucceeded += (_, r) => received = r;

        await vm.SubmitCommand.ExecuteAsync(null);

        client.RegisterCalls.Should().Be(1);
        store.Current!.UserId.Should().Be("u-new");
        received!.Token.Should().Be("tok-new");
    }

    [Fact]
    public async Task Duplicate_email_surfaces_friendly_message()
    {
        var client = new StubAuthClient { NextRegisterThrow = new EmailAlreadyExistsException() };
        var vm = new RegisterViewModel(client, new InMemoryTokenStore())
        {
            Email = "dupe@example.com",
            Password = "Hunter2longenough!",
        };
        await vm.SubmitCommand.ExecuteAsync(null);
        vm.ErrorMessage.Should().Be("That email is already in use.");
    }

    [Fact]
    public async Task Validation_failure_surfaces_validation_message()
    {
        var client = new StubAuthClient { NextRegisterThrow = new AuthValidationException("Password too short", issues: null) };
        var vm = new RegisterViewModel(client, new InMemoryTokenStore())
        {
            Email = "x@example.com",
            Password = "short",
        };
        await vm.SubmitCommand.ExecuteAsync(null);
        vm.ErrorMessage.Should().Be("Password too short");
    }
}
