using Reyn.Application.Abstractions;

namespace Reyn.Infrastructure.Auth;

/// <summary>
/// Phase 2 placeholder that returns the hardcoded <c>"user1"</c> the legacy
/// proxy flow used. Phase 6 replaces this with a DPAPI-backed accessor that
/// reads the persisted bearer token's userId claim.
/// </summary>
public sealed class StaticCurrentUserAccessor : ICurrentUserAccessor
{
    public string UserId => "user1";
}
