using FluentAssertions;
using Reyn.Application.Ingestion;
using Reyn.Infrastructure.Ingestion;
using Xunit;

namespace Reyn.Application.Tests.Ingestion;

public sealed class Bg3DetectionPublisherTests
{
    [Fact]
    public void Current_starts_at_NotDetected()
    {
        new Bg3DetectionPublisher().Current.Should().Be(Bg3DetectionState.NotDetected);
    }

    [Fact]
    public void Publish_updates_Current_and_fires_Changed()
    {
        var pub = new Bg3DetectionPublisher();
        Bg3DetectionState? observed = null;
        pub.Changed += (_, s) => observed = s;

        var next = new Bg3DetectionState(true, DateTime.UtcNow);
        pub.Publish(next);

        pub.Current.Should().Be(next);
        observed.Should().Be(next);
    }

    [Fact]
    public void Identical_state_is_deduped()
    {
        var pub = new Bg3DetectionPublisher();
        var fires = 0;
        pub.Changed += (_, _) => fires++;
        var s = new Bg3DetectionState(true, DateTime.UtcNow);
        pub.Publish(s);
        pub.Publish(s);
        fires.Should().Be(1);
    }

    [Fact]
    public void NotDetected_static_is_canonical_zero_state()
    {
        Bg3DetectionState.NotDetected.IsDetected.Should().BeFalse();
        Bg3DetectionState.NotDetected.DetectedAtUtc.Should().BeNull();
    }
}
