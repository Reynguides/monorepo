using System.Windows;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Auth;

public partial class AuthShellWindow : Window
{
    public AuthShellWindow(AuthShellViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
