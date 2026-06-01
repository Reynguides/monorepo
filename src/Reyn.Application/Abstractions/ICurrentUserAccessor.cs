namespace Reyn.Application.Abstractions;

/// <summary>
/// Resolves the currently-authenticated user for downstream layers (event
/// stamping, per-user query scoping). The production implementation is
/// token-backed via <see cref="ICurrentUserIdSource"/> and falls back to a
/// stable offline id when no session is established.
/// </summary>
public interface ICurrentUserAccessor
{
    string UserId { get; }
}
