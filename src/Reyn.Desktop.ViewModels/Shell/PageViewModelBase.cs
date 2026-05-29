using CommunityToolkit.Mvvm.ComponentModel;

namespace Reyn.Desktop.ViewModels.Shell;

/// <summary>
/// Shared shape for every page-level VM: a state field + headline/subhead +
/// optional error message. Pages override <see cref="LoadAsync"/> to do
/// their actual work; the shell calls it on activation.
/// </summary>
public abstract partial class PageViewModelBase : ObservableObject
{
    [ObservableProperty]
    private PageState _state = PageState.Empty;

    [ObservableProperty]
    private string? _errorMessage;

    public abstract string Title { get; }

    public abstract string Subtitle { get; }

    /// <summary>
    /// Called by the shell on first activation. Default implementation is a
    /// no-op leaving the page in <see cref="PageState.Empty"/>; pages with
    /// real data override this in Phase 8.
    /// </summary>
    public virtual Task LoadAsync(CancellationToken ct) => Task.CompletedTask;
}
