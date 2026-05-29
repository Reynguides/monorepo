using System.ComponentModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Windows.Threading;
using Reyn.Application.Sync;

namespace Reyn.Desktop;

/// <summary>
/// INPC adapter that turns the <see cref="ISyncStatusPublisher"/> event
/// stream into bindable properties for the WPF UI. The publisher fires from
/// the outbox processor's background thread, so updates are marshaled onto
/// the UI thread via the application Dispatcher.
/// </summary>
public sealed class SyncStatusViewModel : INotifyPropertyChanged, IDisposable
{
    private readonly ISyncStatusPublisher _publisher;
    private readonly Dispatcher _dispatcher;
    private SyncSnapshot _snapshot;

    public SyncStatusViewModel(ISyncStatusPublisher publisher, Dispatcher dispatcher)
    {
        _publisher = publisher;
        _dispatcher = dispatcher;
        _snapshot = publisher.Current;
        _publisher.Changed += OnChanged;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public int PendingCount => _snapshot.PendingCount;

    public int DeadLetteredCount => _snapshot.DeadLetteredCount;

    public string LastSuccessfulSyncDisplay =>
        _snapshot.LastSuccessfulSyncAt is { } t
            ? t.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture)
            : "—";

    public string? LastError => _snapshot.LastError;

    public void Dispose() => _publisher.Changed -= OnChanged;

    private void OnChanged(object? sender, SyncSnapshot next)
    {
        _dispatcher.Invoke(() =>
        {
            _snapshot = next;
            Raise(nameof(PendingCount));
            Raise(nameof(DeadLetteredCount));
            Raise(nameof(LastSuccessfulSyncDisplay));
            Raise(nameof(LastError));
        });
    }

    private void Raise([CallerMemberName] string? name = null) =>
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
}
