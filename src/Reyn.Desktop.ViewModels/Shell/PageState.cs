namespace Reyn.Desktop.ViewModels.Shell;

/// <summary>
/// The three visual states every shell page can be in. The
/// <c>PageStateControl</c> in the desktop project switches on this and
/// renders the matching surface (spinner / empty-state card / error card).
/// </summary>
public enum PageState
{
    Loading,
    Empty,
    Error,
    Ready,
}
