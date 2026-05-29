namespace Reyn.Application.Sync;

/// <summary>
/// Lightweight observable contract for <see cref="SyncSnapshot"/>. We don't
/// pull in System.Reactive for one signal — a plain event + an initial value
/// gets us a 90% Subject-equivalent with no new dependency. The UI subscribes
/// via the INPC adapter in the desktop layer.
/// </summary>
public interface ISyncStatusPublisher
{
    SyncSnapshot Current { get; }

    event EventHandler<SyncSnapshot>? Changed;
}

public interface ISyncStatusWriter
{
    void Publish(SyncSnapshot snapshot);
}
