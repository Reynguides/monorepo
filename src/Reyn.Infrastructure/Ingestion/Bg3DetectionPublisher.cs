using Reyn.Application.Ingestion;

namespace Reyn.Infrastructure.Ingestion;

/// <summary>
/// Singleton bus for <see cref="Bg3DetectionState"/>. Same pattern as
/// <c>EventSyncStatusPublisher</c> from Phase 5 — one instance implements
/// both the read and write interfaces.
/// </summary>
public sealed class Bg3DetectionPublisher : IBg3DetectionPublisher, IBg3DetectionWriter
{
    private Bg3DetectionState _current = Bg3DetectionState.NotDetected;

    public Bg3DetectionState Current => _current;

    public event EventHandler<Bg3DetectionState>? Changed;

    public void Publish(Bg3DetectionState state)
    {
        if (state == _current)
        {
            return;
        }
        _current = state;
        Changed?.Invoke(this, state);
    }
}
