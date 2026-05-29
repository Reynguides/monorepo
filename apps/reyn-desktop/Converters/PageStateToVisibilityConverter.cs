using System.Globalization;
using System.Windows;
using System.Windows.Data;
using Reyn.Desktop.ViewModels.Shell;

namespace Reyn.Desktop.Converters;

/// <summary>
/// Visible iff the page is in <see cref="PageState.Ready"/>. Used by each
/// per-page view to swap between its real content and the shared
/// PageStateControl (Loading/Empty/Error surfaces).
/// </summary>
public sealed class PageStateToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is PageState s && s == PageState.Ready ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
