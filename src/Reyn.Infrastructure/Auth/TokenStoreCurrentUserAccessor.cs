using Reyn.Application.Abstractions;

namespace Reyn.Infrastructure.Auth;

/// <summary>
/// Production <see cref="ICurrentUserAccessor"/>: returns the user id of the
/// persisted session (via <see cref="ICurrentUserIdSource"/>, satisfied by
/// <see cref="DpapiTokenStore"/>). Before a session exists — cold start before
/// login, or the DEBUG-only <c>--skip-auth</c>/<c>--demo-mode</c> flows — it
/// falls back to <see cref="FallbackUserId"/> so the local SQLite cache keeps a
/// stable partition key. Replaces the Phase 2 hardcoded
/// <see cref="StaticCurrentUserAccessor"/> in production DI.
/// </summary>
public sealed class TokenStoreCurrentUserAccessor : ICurrentUserAccessor
{
    /// <summary>Offline / pre-login partition key for the local cache.</summary>
    public const string FallbackUserId = "user1";

    private readonly ICurrentUserIdSource _source;

    public TokenStoreCurrentUserAccessor(ICurrentUserIdSource source) => _source = source;

    public string UserId => _source.CurrentUserId ?? FallbackUserId;
}
