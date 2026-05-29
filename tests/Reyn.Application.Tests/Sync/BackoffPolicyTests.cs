using FluentAssertions;
using Reyn.Application.Sync;
using Xunit;

namespace Reyn.Application.Tests.Sync;

public sealed class BackoffPolicyTests
{
    [Fact]
    public void NextDelay_throws_on_invalid_attempt()
    {
        var act = () => BackoffPolicy.NextDelay(0, new Random(0));
        act.Should().Throw<ArgumentOutOfRangeException>();
    }

    [Fact]
    public void NextDelay_throws_on_null_random()
    {
        var act = () => BackoffPolicy.NextDelay(1, null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void NextDelay_grows_exponentially_with_max_jitter_per_attempt()
    {
        // Pinning to a max-jitter Random ensures the upper bound is hit; we
        // check the cap kicks in at ~30s once 2^(attempt-1) * 1s exceeds 30.
        var maxRand = new MaxRandom();
        BackoffPolicy.NextDelay(1, maxRand).TotalSeconds.Should().BeApproximately(1, 0.01);
        BackoffPolicy.NextDelay(2, maxRand).TotalSeconds.Should().BeApproximately(2, 0.01);
        BackoffPolicy.NextDelay(3, maxRand).TotalSeconds.Should().BeApproximately(4, 0.01);
        BackoffPolicy.NextDelay(6, maxRand).TotalSeconds.Should().BeApproximately(30, 0.01);
        BackoffPolicy.NextDelay(20, maxRand).TotalSeconds.Should().BeApproximately(30, 0.01);
    }

    [Fact]
    public void NextDelay_returns_non_negative_value()
    {
        var d = BackoffPolicy.NextDelay(5, new Random(1));
        d.Should().BeGreaterThanOrEqualTo(TimeSpan.Zero);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(9, false)]
    [InlineData(10, true)]
    [InlineData(11, true)]
    public void ShouldDeadLetter_at_max_attempts(int attempts, bool expected)
    {
        BackoffPolicy.ShouldDeadLetter(attempts).Should().Be(expected);
    }

    private sealed class MaxRandom : Random
    {
        public override double NextDouble() => 0.999_999_999;
    }
}
