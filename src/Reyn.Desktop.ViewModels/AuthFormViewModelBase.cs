using CommunityToolkit.Mvvm.ComponentModel;
using Reyn.Application.Auth;

namespace Reyn.Desktop.ViewModels;

/// <summary>
/// Shared field state + submission machinery for the login + register cards.
/// The two views differ only in (a) which <see cref="IAuthClient"/> method
/// they call, and (b) which error messages are interesting; everything else
/// — IsBusy guard, inline banner, password validation — is identical.
/// </summary>
public abstract partial class AuthFormViewModelBase : ObservableObject
{
    [ObservableProperty]
    private string _email = "";

    [ObservableProperty]
    private string _password = "";

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private string? _errorMessage;

    public event EventHandler<AuthResult>? AuthSucceeded;

    /// <summary>
    /// Drives the submit button's IsEnabled binding. We don't validate
    /// email here — the server's Zod schema is the source of truth, and a
    /// 400 surfaces as an inline error.
    /// </summary>
    public bool CanSubmit => !IsBusy && Email.Length > 0 && Password.Length > 0;

    partial void OnEmailChanged(string value) => OnPropertyChanged(nameof(CanSubmit));

    partial void OnPasswordChanged(string value) => OnPropertyChanged(nameof(CanSubmit));

    partial void OnIsBusyChanged(bool value) => OnPropertyChanged(nameof(CanSubmit));

    protected async Task ExecuteSubmitAsync(Func<CancellationToken, Task<AuthResult>> call, CancellationToken ct)
    {
        if (IsBusy)
        {
            return;
        }
        IsBusy = true;
        ErrorMessage = null;
        try
        {
            var result = await call(ct).ConfigureAwait(true);
            AuthSucceeded?.Invoke(this, result);
        }
        catch (AuthException ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }
}
