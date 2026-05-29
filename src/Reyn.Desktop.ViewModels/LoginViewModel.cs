using CommunityToolkit.Mvvm.Input;
using Reyn.Application.Auth;

namespace Reyn.Desktop.ViewModels;

public sealed partial class LoginViewModel(IAuthClient client, IAuthTokenStore tokens)
    : AuthFormViewModelBase
{
    [RelayCommand]
    private Task SubmitAsync(CancellationToken ct) =>
        ExecuteSubmitAsync(async inner =>
        {
            var result = await client.LoginAsync(Email, Password, inner).ConfigureAwait(true);
            await tokens.SaveAsync(new StoredAuth(result.UserId, result.Token, result.ExpiresAt), inner)
                .ConfigureAwait(true);
            return result;
        }, ct);
}
