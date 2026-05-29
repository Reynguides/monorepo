using System.Globalization;
using System.Windows.Data;

namespace Reyn.Desktop.Converters;

/// <summary>
/// Maps a fraction (0..1) to a pixel width given by the converter
/// parameter. Drives the overlay's HP fill bar.
/// </summary>
public sealed class FractionToWidthConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is double fraction && parameter is string max
            && double.TryParse(max, NumberStyles.Float, CultureInfo.InvariantCulture, out var maxWidth))
        {
            return Math.Max(0, Math.Min(1, fraction)) * maxWidth;
        }
        return 0.0;
    }

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture) =>
        throw new NotSupportedException();
}
