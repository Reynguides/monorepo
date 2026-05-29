using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using LiveChartsCore;
using LiveChartsCore.SkiaSharpView;
using LiveChartsCore.SkiaSharpView.Painting;
using Reyn.Application.Queries;
using SkiaSharp;

namespace Reyn.Desktop.ViewModels.Shell;

public sealed partial class DashboardViewModel : PageViewModelBase
{
    private static readonly SKColor AccentColor = new(0xE2, 0xA5, 0x37);
    private static readonly SKColor AccentMutedColor = new(0xB1, 0x81, 0x2B);
    private static readonly SKColor TextSecondaryColor = new(0xB4, 0xB4, 0xC7);

    private readonly IGameEventQueryService? _queries;

    public DashboardViewModel(IGameEventQueryService queries) : this()
    {
        _queries = queries;
    }

    /// <summary>
    /// Parameterless constructor used by tests that want to assert on the
    /// initial bindable surface without spinning up a query service. Loading
    /// is a no-op when <c>_queries</c> is null.
    /// </summary>
    public DashboardViewModel()
    {
        EventsPerDaySeries = new ISeries[]
        {
            new ColumnSeries<int>
            {
                Values = EventsPerDayValues,
                Fill = new SolidColorPaint(AccentColor),
                Name = "Events",
            },
        };
        PlaytimePerDaySeries = new ISeries[]
        {
            new LineSeries<double>
            {
                Values = PlaytimePerDayValues,
                Stroke = new SolidColorPaint(AccentColor, 2),
                GeometryFill = new SolidColorPaint(AccentColor),
                GeometryStroke = new SolidColorPaint(AccentColor, 2),
                Fill = null,
                Name = "Minutes",
            },
        };
        CharacterLevelSeries = new ISeries[]
        {
            new StepLineSeries<int>
            {
                Values = CharacterLevelValues,
                Stroke = new SolidColorPaint(AccentMutedColor, 2),
                GeometryFill = new SolidColorPaint(AccentMutedColor),
                Fill = null,
                Name = "Level",
            },
        };
    }

    public override string Title => "Dashboard";

    public override string Subtitle => "Activity and trends across your most recent runs.";

    public ObservableCollection<DailyEventCount> EventsPerDay { get; } = new();

    public ObservableCollection<DailyPlaytimeMinutes> PlaytimePerDay { get; } = new();

    public ObservableCollection<CharacterLevelPoint> CharacterLevels { get; } = new();

    public ObservableCollection<int> EventsPerDayValues { get; } = new();

    public ObservableCollection<double> PlaytimePerDayValues { get; } = new();

    public ObservableCollection<int> CharacterLevelValues { get; } = new();

    [ObservableProperty]
    private int _totalEvents;

    [ObservableProperty]
    private double _totalPlaytimeMinutes;

    [ObservableProperty]
    private int _maxLevel;

    public ISeries[] EventsPerDaySeries { get; }

    public ISeries[] PlaytimePerDaySeries { get; }

    public ISeries[] CharacterLevelSeries { get; }

    public Axis[] DayAxis { get; } =
    {
        new Axis
        {
            LabelsPaint = new SolidColorPaint(TextSecondaryColor),
            TextSize = 11,
            ShowSeparatorLines = false,
        },
    };

    public Axis[] CountAxis { get; } =
    {
        new Axis
        {
            LabelsPaint = new SolidColorPaint(TextSecondaryColor),
            TextSize = 11,
            MinLimit = 0,
        },
    };

    public Axis[] MinutesAxis { get; } =
    {
        new Axis
        {
            LabelsPaint = new SolidColorPaint(TextSecondaryColor),
            TextSize = 11,
            MinLimit = 0,
        },
    };

    public Axis[] LevelAxis { get; } =
    {
        new Axis
        {
            LabelsPaint = new SolidColorPaint(TextSecondaryColor),
            TextSize = 11,
            MinLimit = 0,
        },
    };

    public override async Task LoadAsync(CancellationToken ct)
    {
        if (_queries is null)
        {
            return;
        }
        State = PageState.Loading;
        ErrorMessage = null;
        try
        {
            var events = await _queries.GetEventsPerDayAsync(30, ct).ConfigureAwait(true);
            var playtime = await _queries.GetPlaytimePerDayAsync(30, ct).ConfigureAwait(true);
            var levels = await _queries.GetCharacterLevelProgressionAsync(ct).ConfigureAwait(true);

            EventsPerDay.Clear();
            EventsPerDayValues.Clear();
            foreach (var row in events)
            {
                EventsPerDay.Add(row);
                EventsPerDayValues.Add(row.Count);
            }
            PlaytimePerDay.Clear();
            PlaytimePerDayValues.Clear();
            foreach (var row in playtime)
            {
                PlaytimePerDay.Add(row);
                PlaytimePerDayValues.Add(row.Minutes);
            }
            CharacterLevels.Clear();
            CharacterLevelValues.Clear();
            foreach (var row in levels)
            {
                CharacterLevels.Add(row);
                CharacterLevelValues.Add(row.Level);
            }

            TotalEvents = events.Sum(e => e.Count);
            TotalPlaytimeMinutes = playtime.Sum(p => p.Minutes);
            MaxLevel = levels.Count == 0 ? 0 : levels.Max(l => l.Level);

            State = TotalEvents == 0 ? PageState.Empty : PageState.Ready;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
            State = PageState.Error;
        }
    }
}
