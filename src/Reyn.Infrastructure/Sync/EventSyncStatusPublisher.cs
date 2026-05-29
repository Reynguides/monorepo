using Reyn.Application.Sync;

namespace Reyn.Infrastructure.Sync;

/// <summary>
/// Singleton bus for <see cref="SyncSnapshot"/>. The outbox processor calls
/// <c>Publish</c> after every cycle; the UI subscribes via
/// <c>ISyncStatusPublisher.Changed</c>.
/// </summary>
public sealed class EventSyncStatusPublisher : ISyncStatusPublisher, ISyncStatusWriter
{
    private SyncSnapshot _current = new(0, 0, null, null);

    public SyncSnapshot Current => _current;

    public event EventHandler<SyncSnapshot>? Changed;

    public void Publish(SyncSnapshot snapshot)
    {
        _current = snapshot;
        Changed?.Invoke(this, snapshot);
    }
}
