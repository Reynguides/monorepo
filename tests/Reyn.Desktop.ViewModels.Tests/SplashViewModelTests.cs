using FluentAssertions;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests;

public sealed class SplashViewModelTests
{
    [Fact]
    public void Defaults_show_checking_session_status()
    {
        var vm = new SplashViewModel();
        vm.StatusMessage.Should().Be("Checking session…");
        vm.Version.Should().Be("0.0.0");
    }

    [Fact]
    public void StatusMessage_raises_property_changed()
    {
        var vm = new SplashViewModel();
        var observed = new List<string?>();
        vm.PropertyChanged += (_, e) => observed.Add(e.PropertyName);
        vm.StatusMessage = "Loading user data…";
        observed.Should().Contain(nameof(SplashViewModel.StatusMessage));
    }

    [Fact]
    public void Version_is_settable_via_init()
    {
        var vm = new SplashViewModel { Version = "1.2.3" };
        vm.Version.Should().Be("1.2.3");
    }
}
