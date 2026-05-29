using FluentAssertions;
using Reyn.Infrastructure.Auth;
using Xunit;

namespace Reyn.Application.Tests.Auth;

public sealed class StaticAuthTokenSourceTests
{
    [Fact]
    public async Task Default_returns_null()
    {
        var src = new StaticAuthTokenSource();
        (await src.GetTokenAsync(CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task SetToken_updates_the_value_handed_out()
    {
        var src = new StaticAuthTokenSource("first");
        (await src.GetTokenAsync(CancellationToken.None)).Should().Be("first");
        src.SetToken("second");
        (await src.GetTokenAsync(CancellationToken.None)).Should().Be("second");
    }
}
