using FluentAssertions;
using Reyn.Application.Queries;
using Reyn.Desktop.ViewModels.Shell;
using Reyn.Desktop.ViewModels.Tests.Stubs;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests.Shell;

/// <summary>
/// Extra coverage on the page VMs — pushes Achievements, Timeline,
/// Events, Settings through their full Load → Empty/Ready transitions,
/// plus the Settings.FocusSection setter.
/// </summary>
public sealed class AdditionalPageVmTests
{
    [Fact]
    public async Task Achievements_publishes_counts_via_PropertyChanged_on_Load()
    {
        var q = new StubQueryService();
        q.Achievements.AddRange(new[]
        {
            new AchievementProgress("a", "A", "", true, 1, 1, DateTime.UtcNow),
            new AchievementProgress("b", "B", "", false, 3, 10, null),
        });
        var vm = new AchievementsViewModel(q);
        var raisedFor = new List<string?>();
        vm.PropertyChanged += (_, e) => raisedFor.Add(e.PropertyName);

        await vm.LoadAsync(CancellationToken.None);

        raisedFor.Should().Contain(nameof(AchievementsViewModel.UnlockedCount));
        raisedFor.Should().Contain(nameof(AchievementsViewModel.TotalCount));
    }

    [Fact]
    public async Task Achievements_lands_Error_when_query_throws()
    {
        var q = new ThrowingQuery();
        var vm = new AchievementsViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Error);
        vm.ErrorMessage.Should().Contain("boom");
    }

    [Fact]
    public async Task Timeline_lands_Error_on_query_exception()
    {
        var q = new ThrowingQuery();
        var vm = new TimelineViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Error);
    }

    [Fact]
    public async Task Timeline_transitions_through_Loading_to_Ready()
    {
        var q = new StubQueryService();
        q.Timeline.Add(new TimelineSession(Guid.NewGuid(), DateTime.UtcNow.AddHours(-1), DateTime.UtcNow, 0, Array.Empty<TimelineEvent>()));
        var vm = new TimelineViewModel(q);
        var states = new List<PageState>();
        vm.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(PageViewModelBase.State))
            {
                states.Add(vm.State);
            }
        };
        await vm.LoadAsync(CancellationToken.None);
        states.Should().Contain(PageState.Loading);
        states.Should().Contain(PageState.Ready);
    }

    [Fact]
    public async Task Events_OnSelectedSourceChanged_recomputes_filter()
    {
        var q = new StubQueryService();
        q.EventTypes.Add("bg3.test");
        q.EventSources.AddRange(new[] { "bg3se", "bg3-mock" });
        q.Events.Add(new EventLogRow(Guid.NewGuid(), "bg3.test", DateTime.UtcNow, "{}", "bg3se"));
        var vm = new EventsViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        var callsBefore = q.GetEventsCallCount;

        vm.SelectedSource = "bg3se";
        await Task.Yield();
        await Task.Delay(20);

        q.GetEventsCallCount.Should().BeGreaterThan(callsBefore);
        q.LastFilter!.Source.Should().Be("bg3se");
    }

    [Fact]
    public async Task Events_Apply_command_re_runs_filter()
    {
        var q = new StubQueryService();
        q.EventTypes.Add("bg3.test");
        q.Events.Add(new EventLogRow(Guid.NewGuid(), "bg3.test", DateTime.UtcNow, "{}", "bg3se"));
        var vm = new EventsViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        var before = q.GetEventsCallCount;
        await vm.ApplyCommand.ExecuteAsync(null);
        q.GetEventsCallCount.Should().BeGreaterThan(before);
    }

    [Fact]
    public async Task Events_Load_rehydration_unsubscribes_old_chips()
    {
        var q = new StubQueryService();
        q.EventTypes.AddRange(new[] { "bg3.a" });
        var vm = new EventsViewModel(q);
        await vm.LoadAsync(CancellationToken.None);

        // Re-hydrate with different types. The old chip's PropertyChanged
        // handler must be cleaned up (covered by HydrateChips' unsubscribe
        // loop) — exercise by toggling an OLD chip reference; it must not
        // re-fire the filter handler.
        var oldChip = vm.TypeChips.First();
        q.EventTypes.Clear();
        q.EventTypes.Add("bg3.b");
        await vm.LoadAsync(CancellationToken.None);

        var callsBefore = q.GetEventsCallCount;
        oldChip.IsSelected = !oldChip.IsSelected;
        await Task.Delay(20);

        q.GetEventsCallCount.Should().Be(callsBefore, "the old chip should not be live after rehydration");
    }

    [Fact]
    public void Settings_FocusSection_round_trips()
    {
        var vm = new SettingsViewModel { FocusSection = "Sync" };
        vm.FocusSection.Should().Be("Sync");
        vm.Title.Should().Be("Settings");
        vm.Subtitle.Should().NotBeNullOrEmpty();
    }

    private sealed class ThrowingQuery : IGameEventQueryService
    {
        public Task<IReadOnlyList<DailyEventCount>> GetEventsPerDayAsync(int days, CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<DailyPlaytimeMinutes>> GetPlaytimePerDayAsync(int days, CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<CharacterLevelPoint>> GetCharacterLevelProgressionAsync(CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<TimelineSession>> GetTimelineAsync(int sessionLimit, int eventsPerSession, CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<AchievementProgress>> GetAchievementsAsync(CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<EventLogRow>> GetEventsAsync(EventFilter filter, int limit, CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<string>> GetDistinctEventTypesAsync(CancellationToken ct) => throw new InvalidOperationException("boom");
        public Task<IReadOnlyList<string>> GetDistinctEventSourcesAsync(CancellationToken ct) => throw new InvalidOperationException("boom");
    }
}
