using CommunityToolkit.Mvvm.ComponentModel;

namespace Reyn.Desktop.ViewModels;

/// <summary>
/// The splash's bindable surface. Owns the "checking session…" message
/// and the assembly version label. The actual session-check IO lives in
/// the App startup flow — this VM is just presentation state.
/// </summary>
public sealed partial class SplashViewModel : ObservableObject
{
    [ObservableProperty]
    private string _statusMessage = "Checking session…";

    public string Version { get; init; } = "0.0.0";
}
