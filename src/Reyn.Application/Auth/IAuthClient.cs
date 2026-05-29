namespace Reyn.Application.Auth;

/// <summary>
/// Typed contract over the Worker's <c>/v1/auth/*</c> + <c>/v1/me</c>
/// endpoints. Translates HTTP failures to the <see cref="AuthException"/>
/// taxonomy so ViewModels stay transport-agnostic.
/// </summary>
public interface IAuthClient
{
    Task<AuthResult> RegisterAsync(string email, string password, CancellationToken ct);

    Task<AuthResult> LoginAsync(string email, string password, CancellationToken ct);

    Task LogoutAsync(string token, CancellationToken ct);

    /// <summary>
    /// Verifies a stored token is still live. Returns null on 401 (caller
    /// should drop the token and route to AuthShell); throws on transport
    /// failure (caller stays on Splash and retries).
    /// </summary>
    Task<CurrentUser?> GetCurrentUserAsync(string token, CancellationToken ct);
}

/// <summary>
/// Mutable counterpart of <see cref="IAuthTokenSource"/>. The auth flow
/// writes here on login/register; the outbox processor reads via the
/// source interface.
/// </summary>
public interface IAuthTokenStore
{
    /// <summary>Persists the token + expiry; replaces any prior value.</summary>
    Task SaveAsync(StoredAuth auth, CancellationToken ct);

    /// <summary>Returns the current persisted blob, or null if none is stored.</summary>
    Task<StoredAuth?> LoadAsync(CancellationToken ct);

    /// <summary>Drops the persisted token (logout, or 401 from /v1/me).</summary>
    Task ClearAsync(CancellationToken ct);
}
