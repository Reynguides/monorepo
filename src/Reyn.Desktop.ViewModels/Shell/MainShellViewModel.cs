using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Reyn.Application.Sync;

namespace Reyn.Desktop.ViewModels.Shell;

/// <summary>
/// Top-level VM for the post-auth window. Owns the navigation list + the
/// currently-active page VM. Page VMs are instantiated up front (cheap
/// records of strings today; Phase 8 will make them DI-injected query
/// services). Selection mutates <see cref="ActivePage"/>; the shell binds a
/// ContentControl to it.
/// </summary>
public sealed partial class MainShellViewModel : ObservableObject
{
    public ObservableCollection<NavigationSection> Sections { get; } =
        new(new[]
        {
            new NavigationSection("Dashboard",    "NavDashboard",    NavigationKey.Dashboard),
            new NavigationSection("Timeline",     "NavTimeline",     NavigationKey.Timeline),
            new NavigationSection("Achievements", "NavAchievements", NavigationKey.Achievements),
            new NavigationSection("Events",       "NavEvents",       NavigationKey.Events),
            new NavigationSection("Settings",     "NavSettings",     NavigationKey.Settings),
        });

    public DashboardViewModel Dashboard { get; }

    public TimelineViewModel Timeline { get; }

    public AchievementsViewModel Achievements { get; }

    public EventsViewModel Events { get; }

    public SettingsViewModel Settings { get; }

    [ObservableProperty]
    private NavigationSection? _selectedSection;

    [ObservableProperty]
    private PageViewModelBase? _activePage;

    [ObservableProperty]
    private SyncSnapshot _syncStatus = new(0, 0, null, null);

    public MainShellViewModel(
        DashboardViewModel dashboard,
        TimelineViewModel timeline,
        AchievementsViewModel achievements,
        EventsViewModel events,
        SettingsViewModel settings)
    {
        Dashboard = dashboard;
        Timeline = timeline;
        Achievements = achievements;
        Events = events;
        Settings = settings;
        SelectedSection = Sections[0];
    }

    [RelayCommand]
    private void OpenSyncSettings()
    {
        Settings.FocusSection = "Sync";
        SelectedSection = Sections.First(s => s.Key == NavigationKey.Settings);
    }

    partial void OnSelectedSectionChanged(NavigationSection? value)
    {
        ActivePage = value?.Key switch
        {
            NavigationKey.Dashboard => Dashboard,
            NavigationKey.Timeline => Timeline,
            NavigationKey.Achievements => Achievements,
            NavigationKey.Events => Events,
            NavigationKey.Settings => Settings,
            _ => null,
        };
    }
}
