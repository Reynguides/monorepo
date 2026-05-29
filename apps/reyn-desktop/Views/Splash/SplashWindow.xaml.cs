using System.Windows;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Splash;

public partial class SplashWindow : Window
{
    public SplashWindow(SplashViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
