namespace Reyn.Application.Abstractions;

/// <summary>
/// Read-side of the authenticated session's user id, exposed synchronously so
/// <see cref="ICurrentUserAccessor"/> can stamp persisted entities without an
/// async hop. Returns <c>null</c> before any session is established (cold start
/// before login, <c>--skip-auth</c>, demo mode). The DPAPI token store
/// satisfies this by mirroring its in-memory session cache.
/// </summary>
public interface ICurrentUserIdSource
{
    /// <summary>The current session's user id, or <c>null</c> if signed out.</summary>
    string? CurrentUserId { get; }
}
