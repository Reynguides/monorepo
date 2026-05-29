namespace Reyn.Desktop.ViewModels.Shell;

/// <summary>
/// One sidebar item: the visible label, an automation-friendly key for
/// FlaUI tests, and which page-VM the shell should show when selected.
/// </summary>
public sealed record NavigationSection(
    string Label,
    string AutomationId,
    NavigationKey Key);

public enum NavigationKey
{
    Dashboard,
    Timeline,
    Achievements,
    Events,
    Settings,
}
