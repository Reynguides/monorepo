using System.Windows;
using System.Diagnostics.CodeAnalysis;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Auth;

[ExcludeFromCodeCoverage]
public partial class AuthShellWindow : Window
{
    public AuthShellWindow(AuthShellViewModel viewModel)
    {
        InitializeComponent();
        DataContext = viewModel;
    }
}
