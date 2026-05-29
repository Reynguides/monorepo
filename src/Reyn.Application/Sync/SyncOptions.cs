namespace Reyn.Application.Sync;

/// <summary>
/// Tunables for the outbox processor. Defaults match the Phase 5 plan.
/// </summary>
public sealed class SyncOptions
{
    public Uri WorkerBaseAddress { get; init; } = new("https://reyn-cloud-worker.example.workers.dev");

    public int BatchSize { get; init; } = 100;

    public TimeSpan IdlePollInterval { get; init; } = TimeSpan.FromSeconds(5);
}
