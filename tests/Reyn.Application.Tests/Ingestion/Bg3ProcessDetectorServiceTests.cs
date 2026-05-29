using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Reyn.Application.Ingestion;
using Reyn.Infrastructure.Ingestion;
using Xunit;

namespace Reyn.Application.Tests.Ingestion;

public sealed class Bg3ProcessDetectorServiceTests
{
    private sealed class StubDetector(Func<bool> isRunning) : IGameDetector
    {
        public int Calls;
        public bool IsBg3Running()
        {
            Calls++;
            return isRunning();
        }
    }

    [Fact]
    public async Task Service_publishes_transition_to_detected_with_timestamp()
    {
        var detector = new StubDetector(() => true);
        var pub = new Bg3DetectionPublisher();
        Bg3DetectionState? latest = null;
        pub.Changed += (_, s) => latest = s;

        var svc = new Bg3ProcessDetectorService(
            detector,
            pub,
            Options.Create(new Bg3DetectionOptions { PollInterval = TimeSpan.FromMilliseconds(30) }),
            NullLogger<Bg3ProcessDetectorService>.Instance);

        using var cts = new CancellationTokenSource();
        await svc.StartAsync(cts.Token);
        await Task.Delay(150);
        cts.Cancel();
        await svc.StopAsync(CancellationToken.None);

        latest.Should().NotBeNull();
        latest!.IsDetected.Should().BeTrue();
        latest.DetectedAtUtc.Should().NotBeNull();
        detector.Calls.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Service_publishes_NotDetected_when_process_disappears()
    {
        var running = true;
        var detector = new StubDetector(() => running);
        var pub = new Bg3DetectionPublisher();

        var svc = new Bg3ProcessDetectorService(
            detector,
            pub,
            Options.Create(new Bg3DetectionOptions { PollInterval = TimeSpan.FromMilliseconds(30) }),
            NullLogger<Bg3ProcessDetectorService>.Instance);

        using var cts = new CancellationTokenSource();
        await svc.StartAsync(cts.Token);
        await Task.Delay(80);
        pub.Current.IsDetected.Should().BeTrue();

        running = false;
        await Task.Delay(120);
        cts.Cancel();
        await svc.StopAsync(CancellationToken.None);

        pub.Current.IsDetected.Should().BeFalse();
        pub.Current.DetectedAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Service_logs_and_continues_on_detector_exception()
    {
        var calls = 0;
        var detector = new StubDetector(() =>
        {
            calls++;
            if (calls == 1)
            {
                throw new InvalidOperationException("flaky");
            }
            return true;
        });
        var pub = new Bg3DetectionPublisher();

        var svc = new Bg3ProcessDetectorService(
            detector,
            pub,
            Options.Create(new Bg3DetectionOptions { PollInterval = TimeSpan.FromMilliseconds(30) }),
            NullLogger<Bg3ProcessDetectorService>.Instance);

        using var cts = new CancellationTokenSource();
        await svc.StartAsync(cts.Token);
        await Task.Delay(150);
        cts.Cancel();
        await svc.StopAsync(CancellationToken.None);

        pub.Current.IsDetected.Should().BeTrue();
    }
}
