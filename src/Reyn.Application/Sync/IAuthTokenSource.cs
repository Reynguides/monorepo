namespace Reyn.Application.Sync;

/// <summary>
/// Hands out the current bearer token. Phase 5 ships a static-stub
/// implementation; Phase 6 replaces it with the DPAPI-backed token store.
/// </summary>
public interface IAuthTokenSource
{
    /// <summary>
    /// Returns the current token, or null if none is available (sync should
    /// idle until a session exists).
    /// </summary>
    Task<string?> GetTokenAsync(CancellationToken ct);
}
