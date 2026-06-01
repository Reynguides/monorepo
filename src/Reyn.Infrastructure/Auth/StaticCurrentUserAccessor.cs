using Reyn.Application.Abstractions;

namespace Reyn.Infrastructure.Auth;

/// <summary>
/// Fixed <c>"user1"</c> accessor kept as an offline/test fallback. Production
/// wires the token-backed <see cref="TokenStoreCurrentUserAccessor"/> instead;
/// this remains for tests and tooling that need a deterministic user id with
/// no session store.
/// </summary>
public sealed class StaticCurrentUserAccessor : ICurrentUserAccessor
{
    public string UserId => "user1";
}
