namespace Reyn.Application.Ingestion;

/// <summary>
/// Tunables for <c>MockBg3EventGenerator</c>. Defaults match the Phase 9
/// AskUserQuestion answer: ~1 event per 2 seconds on average.
/// </summary>
public sealed class MockEventGeneratorOptions
{
    /// <summary>Mean inter-event delay. Actual delays are jittered ±50%.</summary>
    public TimeSpan MeanInterval { get; init; } = TimeSpan.FromSeconds(2);

    /// <summary>Seed for the deterministic Random; null = unseeded.</summary>
    public int? Seed { get; init; }
}
