using System.Globalization;
using System.Windows;
using FluentAssertions;
using Reyn.Desktop.Converters;
using Reyn.Desktop.ViewModels.Shell;
using Xunit;

namespace Reyn.Desktop.UiTests.Converters;

/// <summary>
/// Pure unit tests for the four XAML converters. These don't need FlaUI
/// or a running app — they exist here (in the UiTests project) only
/// because the converters reference System.Windows.Visibility which is
/// WPF-only.
/// </summary>
public sealed class ConverterUnitTests
{
    private static readonly CultureInfo Ci = CultureInfo.InvariantCulture;

    [Fact]
    public void BoolToVisibility_default_mode_maps_true_to_Visible()
    {
        var c = new BoolToVisibilityConverter();
        c.Convert(true, typeof(Visibility), null!, Ci).Should().Be(Visibility.Visible);
        c.Convert(false, typeof(Visibility), null!, Ci).Should().Be(Visibility.Collapsed);
        c.Convert(null!, typeof(Visibility), null!, Ci).Should().Be(Visibility.Collapsed);
    }

    [Fact]
    public void BoolToVisibility_inverted_flips_results()
    {
        var c = new BoolToVisibilityConverter { Invert = true };
        c.Convert(true, typeof(Visibility), null!, Ci).Should().Be(Visibility.Collapsed);
        c.Convert(false, typeof(Visibility), null!, Ci).Should().Be(Visibility.Visible);
    }

    [Fact]
    public void BoolToVisibility_ConvertBack_throws()
    {
        var c = new BoolToVisibilityConverter();
        var act = () => c.ConvertBack(Visibility.Visible, typeof(bool), null!, Ci);
        act.Should().Throw<NotSupportedException>();
    }

    [Fact]
    public void StringToVisibility_non_empty_string_is_Visible()
    {
        var c = new StringToVisibilityConverter();
        c.Convert("hello", typeof(Visibility), null, Ci).Should().Be(Visibility.Visible);
        c.Convert("", typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
        c.Convert(null, typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
        c.Convert(42, typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
    }

    [Fact]
    public void StringToVisibility_ConvertBack_throws()
    {
        var c = new StringToVisibilityConverter();
        var act = () => c.ConvertBack(Visibility.Visible, typeof(string), null!, Ci);
        act.Should().Throw<NotSupportedException>();
    }

    [Fact]
    public void PageStateToVisibility_only_Ready_is_Visible()
    {
        var c = new PageStateToVisibilityConverter();
        c.Convert(PageState.Ready, typeof(Visibility), null, Ci).Should().Be(Visibility.Visible);
        c.Convert(PageState.Empty, typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
        c.Convert(PageState.Loading, typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
        c.Convert(PageState.Error, typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
        c.Convert("not a page state", typeof(Visibility), null, Ci).Should().Be(Visibility.Collapsed);
    }

    [Fact]
    public void PageStateToVisibility_ConvertBack_throws()
    {
        var c = new PageStateToVisibilityConverter();
        var act = () => c.ConvertBack(Visibility.Visible, typeof(PageState), null!, Ci);
        act.Should().Throw<NotSupportedException>();
    }

    [Fact]
    public void FractionToWidth_maps_value_to_max_times_fraction()
    {
        var c = new FractionToWidthConverter();
        c.Convert(0.5, typeof(double), "100", Ci).Should().Be(50.0);
        c.Convert(1.0, typeof(double), "100", Ci).Should().Be(100.0);
        c.Convert(0.0, typeof(double), "100", Ci).Should().Be(0.0);
    }

    [Fact]
    public void FractionToWidth_clamps_inputs()
    {
        var c = new FractionToWidthConverter();
        c.Convert(1.5, typeof(double), "100", Ci).Should().Be(100.0);
        c.Convert(-0.2, typeof(double), "100", Ci).Should().Be(0.0);
    }

    [Fact]
    public void FractionToWidth_handles_unparseable_inputs()
    {
        var c = new FractionToWidthConverter();
        c.Convert(0.5, typeof(double), "not-a-number", Ci).Should().Be(0.0);
        c.Convert("not-a-double", typeof(double), "100", Ci).Should().Be(0.0);
        c.Convert(null, typeof(double), "100", Ci).Should().Be(0.0);
    }

    [Fact]
    public void FractionToWidth_ConvertBack_throws()
    {
        var c = new FractionToWidthConverter();
        var act = () => c.ConvertBack(50.0, typeof(double), "100", Ci);
        act.Should().Throw<NotSupportedException>();
    }
}
