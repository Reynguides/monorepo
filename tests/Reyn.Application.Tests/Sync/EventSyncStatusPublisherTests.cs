using FluentAssertions;
using Reyn.Application.Sync;
using Reyn.Infrastructure.Sync;
using Xunit;

namespace Reyn.Application.Tests.Sync;

public sealed class EventSyncStatusPublisherTests
{
    [Fact]
    public void Current_starts_at_zero_state()
    {
        var pub = new EventSyncStatusPublisher();
        pub.Current.Should().Be(new SyncSnapshot(0, 0, null, null));
    }

    [Fact]
    public void Publish_updates_Current_and_raises_Changed()
    {
        var pub = new EventSyncStatusPublisher();
        SyncSnapshot? received = null;
        pub.Changed += (_, s) => received = s;

        var next = new SyncSnapshot(3, 1, DateTime.UtcNow, "boom");
        pub.Publish(next);

        pub.Current.Should().Be(next);
        received.Should().Be(next);
    }

    [Fact]
    public void No_subscribers_is_safe()
    {
        var pub = new EventSyncStatusPublisher();
        var act = () => pub.Publish(new SyncSnapshot(0, 0, null, null));
        act.Should().NotThrow();
    }
}
