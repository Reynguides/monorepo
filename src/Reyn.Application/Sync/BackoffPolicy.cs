namespace Reyn.Application.Sync;

/// <summary>
/// Decorrelated jitter backoff per AWS guidance: each attempt picks a delay
/// uniformly in <c>[base, min(cap, prev * 3)]</c>. We don't carry "prev"
/// between calls — for the outbox we only need <c>attempt</c>, so this is a
/// degenerate form that grows exponentially with full jitter and a cap.
///
/// attempt 1 → [0, 1s], 2 → [0, 2s], 3 → [0, 4s], …, until capped at 30s.
/// </summary>
public static class BackoffPolicy
{
    public const int MaxAttempts = 10;

    private static readonly TimeSpan Base = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan Cap = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Returns the delay to wait before the (attempt+1)-th try.
    /// <paramref name="attempt"/> is the count of failures so far (1, 2, …).
    /// <paramref name="rand"/> is injected for testability.
    /// </summary>
    public static TimeSpan NextDelay(int attempt, Random rand)
    {
        ArgumentNullException.ThrowIfNull(rand);
        ArgumentOutOfRangeException.ThrowIfLessThan(attempt, 1);

        var exponential = Math.Min(
            Cap.TotalMilliseconds,
            Base.TotalMilliseconds * Math.Pow(2, attempt - 1));
        var jittered = rand.NextDouble() * exponential;
        return TimeSpan.FromMilliseconds(jittered);
    }

    public static bool ShouldDeadLetter(int attempts) => attempts >= MaxAttempts;
}
