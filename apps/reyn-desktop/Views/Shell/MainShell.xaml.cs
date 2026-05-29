using System.Windows;
using Reyn.Application.Sync;
using Reyn.Desktop.ViewModels.Shell;

namespace Reyn.Desktop.Views.Shell;

public partial class MainShell : Window
{
    private readonly ISyncStatusPublisher _statusPublisher;
    private readonly MainShellViewModel _viewModel;

    public MainShell(MainShellViewModel viewModel, ISyncStatusPublisher statusPublisher)
    {
        _viewModel = viewModel;
        _statusPublisher = statusPublisher;
        InitializeComponent();
        DataContext = _viewModel;
        _viewModel.SyncStatus = _statusPublisher.Current;
        _statusPublisher.Changed += OnSyncStatusChanged;
        Closed += OnClosed;
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        _statusPublisher.Changed -= OnSyncStatusChanged;
        Closed -= OnClosed;
    }

    private void OnSyncStatusChanged(object? sender, SyncSnapshot snapshot)
    {
        Dispatcher.Invoke(() => _viewModel.SyncStatus = snapshot);
    }
}
