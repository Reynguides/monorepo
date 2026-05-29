using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;
using System.Windows;
using System.Windows.Controls;
using Reyn.Desktop.ViewModels.Shell;

namespace Reyn.Desktop.Views.Shell.Controls;

/// <summary>
/// Single tri-state surface every shell page composes. Binds to the page
/// VM's <c>State</c> property and shows exactly one of Loading / Empty /
/// Error / (nothing â€” page renders its own ready surface).
/// </summary>
[ExcludeFromCodeCoverage]
public partial class PageStateControl : UserControl
{
    public PageStateControl()
    {
        InitializeComponent();
        DataContextChanged += OnDataContextChanged;
    }

    private void OnDataContextChanged(object? sender, DependencyPropertyChangedEventArgs e)
    {
        if (e.OldValue is INotifyPropertyChanged oldNotify)
        {
            oldNotify.PropertyChanged -= OnSourcePropertyChanged;
        }
        if (e.NewValue is INotifyPropertyChanged newNotify)
        {
            newNotify.PropertyChanged += OnSourcePropertyChanged;
        }
        UpdateVisibility();
    }

    private void OnSourcePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(PageViewModelBase.State))
        {
            UpdateVisibility();
        }
    }

    private void UpdateVisibility()
    {
        var state = DataContext is PageViewModelBase vm ? vm.State : PageState.Ready;
        LoadingPanel.Visibility = state == PageState.Loading ? Visibility.Visible : Visibility.Collapsed;
        EmptyPanel.Visibility = state == PageState.Empty ? Visibility.Visible : Visibility.Collapsed;
        ErrorPanel.Visibility = state == PageState.Error ? Visibility.Visible : Visibility.Collapsed;
    }
}
