using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Reyn.Application.Auth;

namespace Reyn.Desktop.ViewModels;

/// <summary>
/// Hosts the login/register card; tracks which sub-VM is active and exposes
/// a single <see cref="AuthSucceeded"/> notification the app shell hooks
/// onto to swap the AuthShell window out for MainWindow.
/// </summary>
public sealed partial class AuthShellViewModel : ObservableObject
{
    public LoginViewModel Login { get; }

    public RegisterViewModel Register { get; }

    [ObservableProperty]
    private bool _isLoginActive = true;

    public AuthShellViewModel(LoginViewModel login, RegisterViewModel register)
    {
        Login = login;
        Register = register;
        Login.AuthSucceeded += OnInnerSucceeded;
        Register.AuthSucceeded += OnInnerSucceeded;
    }

    public event EventHandler<AuthResult>? AuthSucceeded;

    [RelayCommand]
    private void ShowLogin() => IsLoginActive = true;

    [RelayCommand]
    private void ShowRegister() => IsLoginActive = false;

    private void OnInnerSucceeded(object? sender, AuthResult e) =>
        AuthSucceeded?.Invoke(this, e);
}
