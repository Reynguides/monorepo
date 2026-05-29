using Xunit;

// FlaUI tests share desktop state (window focus, topmost stack, screenshot
// pipeline). Running them in parallel produces intermittent failures where
// SetForegroundWindow races with another launched fixture. Serialize the
// whole assembly.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
