using FluentAssertions;
using Reyn.Desktop.ViewModels.Shell;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests.Shell;

public sealed class MainShellViewModelTests
{
    private static MainShellViewModel Build() =>
        new(
            new DashboardViewModel(),
            new TimelineViewModel(),
            new AchievementsViewModel(),
            new EventsViewModel(),
            new SettingsViewModel());

    [Fact]
    public void Defaults_to_dashboard_section_and_active_page()
    {
        var shell = Build();
        shell.SelectedSection!.Key.Should().Be(NavigationKey.Dashboard);
        shell.ActivePage.Should().BeOfType<DashboardViewModel>();
    }

    [Fact]
    public void Selecting_a_section_changes_active_page()
    {
        var shell = Build();
        var events = shell.Sections.First(s => s.Key == NavigationKey.Events);
        shell.SelectedSection = events;
        shell.ActivePage.Should().BeOfType<EventsViewModel>();
    }

    [Fact]
    public void OpenSyncSettings_routes_to_settings_with_focus_section()
    {
        var shell = Build();
        shell.OpenSyncSettingsCommand.Execute(null);
        shell.SelectedSection!.Key.Should().Be(NavigationKey.Settings);
        shell.ActivePage.Should().BeOfType<SettingsViewModel>();
        shell.Settings.FocusSection.Should().Be("Sync");
    }

    [Fact]
    public void Setting_section_to_null_clears_active_page()
    {
        var shell = Build();
        shell.SelectedSection = null;
        shell.ActivePage.Should().BeNull();
    }

    [Fact]
    public void Sections_list_is_in_canonical_order()
    {
        var shell = Build();
        var keys = shell.Sections.Select(s => s.Key).ToList();
        keys.Should().Equal(
            NavigationKey.Dashboard,
            NavigationKey.Timeline,
            NavigationKey.Achievements,
            NavigationKey.Events,
            NavigationKey.Settings);
    }
}
