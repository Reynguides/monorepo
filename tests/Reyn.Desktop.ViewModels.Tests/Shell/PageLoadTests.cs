using FluentAssertions;
using Reyn.Application.Queries;
using Reyn.Desktop.ViewModels.Shell;
using Reyn.Desktop.ViewModels.Tests.Stubs;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests.Shell;

public sealed class PageLoadTests
{
    [Fact]
    public async Task Dashboard_loads_into_Empty_when_no_data()
    {
        var vm = new DashboardViewModel(new StubQueryService());
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Empty);
        vm.TotalEvents.Should().Be(0);
        vm.MaxLevel.Should().Be(0);
    }

    [Fact]
    public async Task Dashboard_loads_into_Ready_when_events_present()
    {
        var q = new StubQueryService();
        q.EventsPerDay.Add(new DailyEventCount(DateOnly.FromDateTime(DateTime.UtcNow), 3));
        q.PlaytimePerDay.Add(new DailyPlaytimeMinutes(DateOnly.FromDateTime(DateTime.UtcNow), 45));
        q.CharacterLevels.Add(new CharacterLevelPoint(DateTime.UtcNow, 5));
        var vm = new DashboardViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Ready);
        vm.TotalEvents.Should().Be(3);
        vm.MaxLevel.Should().Be(5);
    }

    [Fact]
    public async Task Dashboard_default_ctor_is_safe_for_design_time()
    {
        var vm = new DashboardViewModel();
        await vm.LoadAsync(CancellationToken.None);
        vm.EventsPerDaySeries.Should().HaveCount(1);
        vm.PlaytimePerDaySeries.Should().HaveCount(1);
        vm.CharacterLevelSeries.Should().HaveCount(1);
    }

    [Fact]
    public async Task Timeline_lands_in_Empty_or_Ready_based_on_session_count()
    {
        var q = new StubQueryService();
        var vm = new TimelineViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Empty);

        q.Timeline.Add(new TimelineSession(Guid.NewGuid(), DateTime.UtcNow.AddHours(-1), DateTime.UtcNow, 0, Array.Empty<TimelineEvent>()));
        var vm2 = new TimelineViewModel(q);
        await vm2.LoadAsync(CancellationToken.None);
        vm2.State.Should().Be(PageState.Ready);
    }

    [Fact]
    public async Task Achievements_publishes_counts_after_load()
    {
        var q = new StubQueryService();
        q.Achievements.AddRange(new[]
        {
            new AchievementProgress("a", "A", "", true, 1, 1, DateTime.UtcNow),
            new AchievementProgress("b", "B", "", false, 3, 10, null),
        });
        var vm = new AchievementsViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Ready);
        vm.UnlockedCount.Should().Be(1);
        vm.TotalCount.Should().Be(2);
    }

    [Fact]
    public async Task Page_VMs_transition_to_Error_on_query_exception()
    {
        var q = new ThrowingQueryService();
        var vm = new TimelineViewModel(q);
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Error);
        vm.ErrorMessage.Should().Contain("boom");
    }

    private sealed class ThrowingQueryService : IGameEventQueryService
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
