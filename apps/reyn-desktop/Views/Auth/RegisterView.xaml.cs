using System.Windows.Controls;
using Reyn.Desktop.ViewModels;

namespace Reyn.Desktop.Views.Auth;

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
