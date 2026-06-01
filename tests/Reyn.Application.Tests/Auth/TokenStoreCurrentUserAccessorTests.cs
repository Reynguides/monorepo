using FluentAssertions;
using Reyn.Application.Abstractions;
using Reyn.Infrastructure.Auth;
using Xunit;

namespace Reyn.Application.Tests.Auth;

public sealed class TokenStoreCurrentUserAccessorTests
{
    private sealed class FakeSource : ICurrentUserIdSource
    {
        public string? CurrentUserId { get; set; }
    }

    [Fact]
    public void Returns_session_user_id_when_a_session_is_present()
    {
        var accessor = new TokenStoreCurrentUserAccessor(new FakeSource { CurrentUserId = "alice" });
        accessor.UserId.Should().Be("alice");
    }

    [Fact]
    public void Falls_back_to_user1_when_no_session_is_established()
    {
        var accessor = new TokenStoreCurrentUserAccessor(new FakeSource { CurrentUserId = null });
        accessor.UserId.Should().Be("user1");
        TokenStoreCurrentUserAccessor.FallbackUserId.Should().Be("user1");
    }
}
