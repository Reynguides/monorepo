namespace Reyn.Application.Ingestion;

/// <summary>
/// Snapshot of whether BG3 is detected as running, with the timestamp the
/// first detection happened (used by the overlay to drive the session
/// timer). <see cref="DetectedAtUtc"/> is null when not detected.
/// </summary>
public sealed record Bg3DetectionState(bool IsDetected, DateTime? DetectedAtUtc)
{
    public static Bg3DetectionState NotDetected => new(false, null);
}

/// <summary>
/// Pluggable BG3 process detector — concrete impl in Infrastructure polls
/// <c>Process.GetProcessesByName</c>. Tests stub this directly to drive
/// the detector loop without touching the OS process table.
/// </summary>
public interface IGameDetector
{
    /// <summary>One-shot check: are we seeing the BG3 process right now?</summary>
    bool IsBg3Running();
}

/// <summary>
/// Read side of the detection signal. Overlay subscribes here.
/// </summary>
public interface IBg3DetectionPublisher
{
    Bg3DetectionState Current { get; }

    event EventHandler<Bg3DetectionState>? Changed;
}

/// <summary>
/// Write side. The polling hosted service in Infrastructure pushes
/// updates here on every tick that changes detection.
/// </summary>
public interface IBg3DetectionWriter
{
    void Publish(Bg3DetectionState state);
}
