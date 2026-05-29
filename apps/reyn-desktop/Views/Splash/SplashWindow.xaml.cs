using System.Windows;
using System.Diagnostics.CodeAnalysis;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Splash;

[ExcludeFromCodeCoverage]
public partial class SplashWindow : Window
{
    public SplashWindow(SplashViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
