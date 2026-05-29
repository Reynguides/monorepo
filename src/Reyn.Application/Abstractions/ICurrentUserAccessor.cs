namespace Reyn.Application.Abstractions;

/// <summary>
/// Resolves the currently-authenticated user for downstream layers.
/// Phase 2 ships a static accessor returning <c>"user1"</c>; Phase 6 replaces
/// it with a DPAPI-backed reader of the persisted session token.
/// </summary>
public interface ICurrentUserAccessor
{
    string UserId { get; }
}
