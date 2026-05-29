using System.Windows.Controls;
using System.Diagnostics.CodeAnalysis;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Auth;

[ExcludeFromCodeCoverage]
public partial class RegisterView : UserControl
{
    public RegisterView()
    {
        InitializeComponent();
    }

    private void OnPasswordChanged(object sender, System.Windows.RoutedEventArgs e)
    {
        if (DataContext is RegisterViewModel vm && sender is PasswordBox pb)
        {
            vm.Password = pb.Password;
        }
    }
}
