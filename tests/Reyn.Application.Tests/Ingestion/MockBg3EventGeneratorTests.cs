using FluentAssertions;
using Microsoft.Extensions.Options;
using Reyn.Application.Ingestion;
using Reyn.Contracts.Events;
using Reyn.Infrastructure.Ingestion;
using Xunit;

namespace Reyn.Application.Tests.Ingestion;

public sealed class MockBg3EventGeneratorTests
{
    private static MockBg3EventGenerator Build(TimeSpan? interval = null, int seed = 42) =>
        new(Options.Create(new MockEventGeneratorOptions
        {
            MeanInterval = interval ?? TimeSpan.FromMilliseconds(5),
            Seed = seed,
        }));

    private static async Task<List<IncomingGameEvent>> Take(MockBg3EventGenerator gen, int count)
    {
        var result = new List<IncomingGameEvent>();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await foreach (var ev in gen.StreamAsync(cts.Token))
        {
            result.Add(ev);
            if (result.Count >= count)
            {
                break;
            }
        }
        return result;
    }

    [Fact]
    public void SourceName_is_bg3_mock()
    {
        Build().SourceName.Should().Be("bg3-mock");
    }

    [Fact]
    public async Task First_event_is_session_started()
    {
        var events = await Take(Build(), 1);
        events.Should().ContainSingle();
        events[0].Type.Should().Be(Bg3EventTypes.SessionStarted);
        events[0].PayloadJson.Should().Contain("bg3-mock");
    }

    [Fact]
    public async Task Stream_emits_known_catalog_types()
    {
        var events = await Take(Build(), 30);
        events.Should().HaveCount(30);
        events.Select(e => e.Type).Should().AllSatisfy(t =>
            Bg3EventTypes.All.Should().Contain(t, $"every emitted type must be in the catalog (was {t})"));
    }

    [Fact]
    public async Task Same_seed_produces_same_sequence()
    {
        var a = await Take(Build(seed: 7), 10);
        var b = await Take(Build(seed: 7), 10);
        a.Select(e => e.Type).Should().Equal(b.Select(e => e.Type));
    }

    [Fact]
    public async Task Different_seeds_produce_different_sequences()
    {
        var a = await Take(Build(seed: 1), 10);
        var b = await Take(Build(seed: 2), 10);
        a.Select(e => e.Type).Should().NotEqual(b.Select(e => e.Type));
    }

    [Fact]
    public async Task Generator_honors_cancellation()
    {
        var gen = Build(interval: TimeSpan.FromMilliseconds(50));
        using var cts = new CancellationTokenSource();
        cts.CancelAfter(TimeSpan.FromMilliseconds(150));
        var events = new List<IncomingGameEvent>();
        await foreach (var ev in gen.StreamAsync(cts.Token))
        {
            events.Add(ev);
        }
        events.Should().NotBeEmpty();
    }

    [Fact]
    public async Task Default_options_compile_without_seed()
    {
        var defaultGen = new MockBg3EventGenerator(Options.Create(new MockEventGeneratorOptions
        {
            MeanInterval = TimeSpan.FromMilliseconds(5),
        }));
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var events = new List<IncomingGameEvent>();
        await foreach (var ev in defaultGen.StreamAsync(cts.Token))
        {
            events.Add(ev);
            if (events.Count >= 5) break;
        }
        events.Should().HaveCount(5);
    }
}
