using System.Globalization;
using System.Windows;
using System.Windows.Data;

namespace Reyn.Desktop.Converters;

/// <summary>
/// Maps <c>true</c> to <see cref="Visibility.Visible"/>, <c>false</c> to
/// <see cref="Visibility.Collapsed"/>. WPF's built-in `BooleanToVisibilityConverter`
/// has no Inverse mode; we provide both flavors instead of swallowing a
/// converter library dep.
/// </summary>
public sealed class BoolToVisibilityConverter : IValueConverter
{
    public bool Invert { get; set; }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
    {
        var truthy = value is true;
        if (Invert)
        {
            truthy = !truthy;
        }
        return truthy ? Visibility.Visible : Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
