using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Reyn.Desktop.Converters;

/// <summary>
/// Maps a non-empty string to <see cref="Visibility.Visible"/>, and
/// null/empty to <see cref="Visibility.Collapsed"/>. Drives the inline
/// error banner: the banner stays out of the layout when there's nothing
/// to show.
/// </summary>
public sealed class StringToVisibilityConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture) =>
        value is string s && s.Length > 0 ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
