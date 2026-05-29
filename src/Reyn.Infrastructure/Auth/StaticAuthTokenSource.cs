using Reyn.Application.Sync;

namespace Reyn.Infrastructure.Auth;

/// <summary>
/// Phase-5 placeholder: hands out a single bearer token configured at
/// startup. Phase 6 replaces this with a DPAPI-backed reader of the
/// persisted refresh token.
/// </summary>
public sealed class StaticAuthTokenSource(string? token = null) : IAuthTokenSource
{
    private string? _token = token;

    public void SetToken(string? token) => _token = token;

    public Task<string?> GetTokenAsync(CancellationToken ct) => Task.FromResult(_token);
}
