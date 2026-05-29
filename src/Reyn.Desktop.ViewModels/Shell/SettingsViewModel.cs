namespace Reyn.Desktop.ViewModels.Shell;

/// <summary>
/// Settings page placeholder. Phase 7 just establishes the shell; Phase 11
/// fills in toggles for theme, overlay opt-in, telemetry, and a Sync
/// section the badge clicks navigate to.
/// </summary>
public sealed partial class SettingsViewModel : PageViewModelBase
{
    public override string Title => "Settings";

    public override string Subtitle => "Account, sync, and overlay preferences.";

    /// <summary>
    /// When the sync badge in the shell is clicked, the shell sets this so
    /// the Settings page can scroll the Sync section into view. Phase 7
    /// ships the wire; Phase 11 ships the scroll behavior.
    /// </summary>
    public string? FocusSection { get; set; }
}
