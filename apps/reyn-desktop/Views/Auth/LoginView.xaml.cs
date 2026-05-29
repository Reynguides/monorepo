using System.Windows.Controls;
using System.Diagnostics.CodeAnalysis;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Auth;

[ExcludeFromCodeCoverage]
public partial class LoginView : UserControl
{
    public LoginView()
    {
        InitializeComponent();
    }

    private void OnPasswordChanged(object sender, System.Windows.RoutedEventArgs e)
    {
        if (DataContext is LoginViewModel vm && sender is PasswordBox pb)
        {
            vm.Password = pb.Password;
        }
    }
}
