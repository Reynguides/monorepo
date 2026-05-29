using System.Collections.ObjectModel;
using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Reyn.Application.Queries;

namespace Reyn.Desktop.ViewModels.Shell;

public sealed partial class EventsViewModel(IGameEventQueryService queries) : PageViewModelBase
{
    public override string Title => "Events";

    public override string Subtitle => "Raw event log. Filter by type, date, or source.";

    public const string AllSourcesSentinel = "All sources";

    /// <summary>Toggleable chips for the type filter; built from distinct DB types on Load.</summary>
    public ObservableCollection<EventTypeChip> TypeChips { get; } = new();

    /// <summary>Sources observed locally (e.g. "bg3se", "bg3-mock"); first entry is "All".</summary>
    public ObservableCollection<string> Sources { get; } = new() { AllSourcesSentinel };

    /// <summary>Filtered rows shown in the list. Recomputed on filter changes.</summary>
    public ObservableCollection<EventLogRow> Events { get; } = new();

    [ObservableProperty]
    private DateTime? _fromUtc;

    [ObservableProperty]
    private DateTime? _toUtc;

    [ObservableProperty]
    private string _selectedSource = AllSourcesSentinel;

    [ObservableProperty]
    private int _visibleCount;

    public override async Task LoadAsync(CancellationToken ct)
    {
        State = PageState.Loading;
        ErrorMessage = null;
        try
        {
            var types = await queries.GetDistinctEventTypesAsync(ct).ConfigureAwait(true);
            var sources = await queries.GetDistinctEventSourcesAsync(ct).ConfigureAwait(true);
            HydrateChips(types);
            HydrateSources(sources);
            await ApplyFilterAsync(ct).ConfigureAwait(true);
            State = Events.Count == 0 ? PageState.Empty : PageState.Ready;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
            State = PageState.Error;
        }
    }

    [RelayCommand]
    private async Task ApplyAsync(CancellationToken ct)
    {
        await ApplyFilterAsync(ct).ConfigureAwait(true);
    }

    [RelayCommand]
    private async Task ClearAsync(CancellationToken ct)
    {
        foreach (var chip in TypeChips)
        {
            chip.IsSelected = false;
        }
        FromUtc = null;
        ToUtc = null;
        SelectedSource = AllSourcesSentinel;
        await ApplyFilterAsync(ct).ConfigureAwait(true);
    }

    private async Task ApplyFilterAsync(CancellationToken ct)
    {
        var selectedTypes = TypeChips.Where(c => c.IsSelected).Select(c => c.TypeKey).ToList();
        var source = string.Equals(SelectedSource, AllSourcesSentinel, StringComparison.Ordinal)
            ? null
            : SelectedSource;
        var filter = new EventFilter(selectedTypes, FromUtc, ToUtc, source);
        var rows = await queries.GetEventsAsync(filter, 500, ct).ConfigureAwait(true);
        Events.Clear();
        foreach (var row in rows) Events.Add(row);
        VisibleCount = Events.Count;
    }

    private void HydrateChips(IReadOnlyList<string> types)
    {
        foreach (var chip in TypeChips)
        {
            chip.PropertyChanged -= OnChipChanged;
        }
        TypeChips.Clear();
        foreach (var t in types)
        {
            var chip = new EventTypeChip(t);
            chip.PropertyChanged += OnChipChanged;
            TypeChips.Add(chip);
        }
    }

    private void HydrateSources(IReadOnlyList<string> sources)
    {
        Sources.Clear();
        Sources.Add(AllSourcesSentinel);
        foreach (var s in sources) Sources.Add(s);
    }

    private async void OnChipChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(EventTypeChip.IsSelected))
        {
            await ApplyFilterAsync(CancellationToken.None).ConfigureAwait(true);
        }
    }

    partial void OnSelectedSourceChanged(string value)
    {
        _ = ApplyFilterAsync(CancellationToken.None);
    }
}
