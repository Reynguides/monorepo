using FluentAssertions;
using Reyn.Application.Sync;
using Xunit;

namespace Reyn.Application.Tests.Sync;

/// <summary>
/// Cheap smoke checks on the wire DTOs. Records auto-generate equality and
/// <c>ToString</c>; we exercise both so the coverage tool counts the
/// synthesised members.
/// </summary>
public sealed class DataShapeTests
{
    [Fact]
    public void PullItem_supports_value_equality_and_clone()
    {
        var id = Guid.NewGuid();
        var a = new PullItem(id, "t", 1, "{}", "h", 2, 3);
        var b = a with { Type = "t2" };
        a.Should().NotBe(b);
        a.EventId.Should().Be(id);
        a.Type.Should().Be("t");
        a.OccurredAt.Should().Be(1);
        a.PayloadJson.Should().Be("{}");
        a.ContentHash.Should().Be("h");
        a.ReceivedAt.Should().Be(2);
        a.Cursor.Should().Be(3);
        a.ToString().Should().Contain("PullItem");
    }

    [Fact]
    public void EventPayload_PullPage_PushResult_round_trip_through_with_expressions()
    {
        var ep = new EventPayload(Guid.NewGuid(), "t", 0, "{}");
        var ep2 = ep with { Type = "t2" };
        ep2.Type.Should().Be("t2");

        var pull = new PullPage(new[] { new PullItem(Guid.NewGuid(), "t", 1, "{}", "h", 2, 3) }, 7);
        pull.NextCursor.Should().Be(7);

        var push = new PushResult(1, 2);
        (push with { Duplicates = 5 }).Duplicates.Should().Be(5);
    }
}
