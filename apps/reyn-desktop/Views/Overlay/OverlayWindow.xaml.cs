using System.Diagnostics.CodeAnalysis;
using System.Windows;
using System.Windows.Threading;
using Reyn.Application.Ingestion;
using Reyn.Desktop.ViewModels.Overlay;

namespace Reyn.Desktop.Views.Overlay;

// WPF Window doesn't implement IDisposable; the CancellationTokenSource is
// disposed in OnClosed. CA1001 expects the type itself to be IDisposable
// but that's not the WPF convention for windows.
[SuppressMessage("Reliability", "CA1001:Types that own disposable fields should be disposable",
    Justification = "Disposed deterministically in the Closed event handler")]
public partial class OverlayWindow : Window
{
    private readonly OverlayViewModel _viewModel;
    private readonly IBg3DetectionPublisher _detection;
    private readonly DispatcherTimer _timerTick;
    private readonly CancellationTokenSource _ingestCts = new();
    private readonly IReadOnlyList<IGameEventSource> _sources;

    public OverlayWindow(
        OverlayViewModel viewModel,
        IBg3DetectionPublisher detection,
        IEnumerable<IGameEventSource> sources)
    {
        _viewModel = viewModel;
        _detection = detection;
        _sources = sources.ToList();
        InitializeComponent();
        DataContext = _viewModel;

        _viewModel.UpdateDetectionState(_detection.Current, DateTime.UtcNow);
        _detection.Changed += OnDetectionChanged;

        // Refresh the session timer every second; cheap and keeps the
        // mm:ss label live without a stream of detection events.
        _timerTick = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromSeconds(1),
        };
        _timerTick.Tick += (_, _) => _viewModel.UpdateDetectionState(_detection.Current, DateTime.UtcNow);
        _timerTick.Start();

        SourceInitialized += (_, _) => OverlayWindowInterop.MakeClickThroughTopmost(this);
        Loaded += OnLoaded;
        Closed += OnClosed;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        foreach (var source in _sources)
        {
            _ = ConsumeAsync(source, _ingestCts.Token);
        }
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        _ingestCts.Cancel();
        _ingestCts.Dispose();
        _detection.Changed -= OnDetectionChanged;
        _timerTick.Stop();
    }

    private async Task ConsumeAsync(IGameEventSource source, CancellationToken ct)
    {
        try
        {
            await foreach (var ev in source.StreamAsync(ct).ConfigureAwait(true))
            {
                _viewModel.PushEvent(ev.Type, ev.OccurredAt);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown.
        }
    }

    private void OnDetectionChanged(object? sender, Bg3DetectionState state)
    {
        Dispatcher.Invoke(() => _viewModel.UpdateDetectionState(state, DateTime.UtcNow));
    }
}
