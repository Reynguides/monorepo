using FluentAssertions;
using Reyn.Application.Queries;
using Reyn.Desktop.ViewModels.Shell;
using Reyn.Desktop.ViewModels.Tests.Stubs;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests.Shell;

public sealed class EventsViewModelTests
{
    private static EventLogRow Row(Guid id, string type, DateTime at, string source) =>
        new(id, type, at, $"{{\"source\":\"{source}\"}}", source);

    private static (EventsViewModel vm, StubQueryService q) Build()
    {
        var q = new StubQueryService();
        q.EventTypes.AddRange(new[] { "bg3.combat.enemy_killed", "bg3.dialogue.choice_made", "bg3.region.entered" });
        q.EventSources.AddRange(new[] { "bg3se", "bg3-mock" });
        return (new EventsViewModel(q), q);
    }

    [Fact]
    public async Task LoadAsync_hydrates_chips_and_sources_and_transitions_state()
    {
        var (vm, q) = Build();
        q.Events.AddRange(new[]
        {
            Row(Guid.NewGuid(), "bg3.combat.enemy_killed", DateTime.UtcNow, "bg3se"),
        });

        await vm.LoadAsync(CancellationToken.None);

        vm.TypeChips.Select(c => c.TypeKey).Should().Equal(
            "bg3.combat.enemy_killed", "bg3.dialogue.choice_made", "bg3.region.entered");
        vm.Sources.Should().StartWith(EventsViewModel.AllSourcesSentinel);
        vm.Sources.Should().Contain("bg3se").And.Contain("bg3-mock");
        vm.State.Should().Be(PageState.Ready);
        vm.VisibleCount.Should().Be(1);
    }

    [Fact]
    public async Task Toggling_a_chip_filters_the_event_list()
    {
        var (vm, q) = Build();
        q.Events.AddRange(new[]
        {
            Row(Guid.NewGuid(), "bg3.combat.enemy_killed", DateTime.UtcNow, "bg3se"),
            Row(Guid.NewGuid(), "bg3.dialogue.choice_made", DateTime.UtcNow, "bg3se"),
            Row(Guid.NewGuid(), "bg3.region.entered", DateTime.UtcNow, "bg3se"),
        });
        await vm.LoadAsync(CancellationToken.None);

        vm.TypeChips.First(c => c.TypeKey == "bg3.combat.enemy_killed").IsSelected = true;
        // Give the async chip handler a tick.
        await Task.Yield();

        vm.LastFilterShouldMatchTypes("bg3.combat.enemy_killed", q);
        vm.Events.Should().ContainSingle();
    }

    [Fact]
    public async Task Selecting_a_source_re_applies_the_filter()
    {
        var (vm, q) = Build();
        q.Events.AddRange(new[]
        {
            Row(Guid.NewGuid(), "bg3.combat.enemy_killed", DateTime.UtcNow, "bg3se"),
            Row(Guid.NewGuid(), "bg3.combat.enemy_killed", DateTime.UtcNow, "bg3-mock"),
        });
        await vm.LoadAsync(CancellationToken.None);
        var callsBefore = q.GetEventsCallCount;

        vm.SelectedSource = "bg3-mock";
        await Task.Yield();

        q.GetEventsCallCount.Should().BeGreaterThan(callsBefore);
        q.LastFilter!.Source.Should().Be("bg3-mock");
    }

    [Fact]
    public async Task Clear_command_resets_chips_dates_and_source()
    {
        var (vm, q) = Build();
        q.Events.AddRange(new[]
        {
            Row(Guid.NewGuid(), "bg3.combat.enemy_killed", DateTime.UtcNow, "bg3se"),
        });
        await vm.LoadAsync(CancellationToken.None);
        vm.TypeChips.First().IsSelected = true;
        vm.FromUtc = DateTime.UtcNow.AddDays(-1);
        vm.SelectedSource = "bg3se";

        await vm.ClearCommand.ExecuteAsync(null);

        vm.TypeChips.Should().OnlyContain(c => !c.IsSelected);
        vm.FromUtc.Should().BeNull();
        vm.ToUtc.Should().BeNull();
        vm.SelectedSource.Should().Be(EventsViewModel.AllSourcesSentinel);
    }

    [Fact]
    public async Task Empty_DB_lands_in_Empty_state_with_zero_visible()
    {
        var (vm, _) = Build();
        await vm.LoadAsync(CancellationToken.None);
        vm.State.Should().Be(PageState.Empty);
        vm.VisibleCount.Should().Be(0);
    }

    [Fact]
    public async Task DisplayLabel_strips_bg3_prefix_for_chips()
    {
        var (vm, _) = Build();
        await vm.LoadAsync(CancellationToken.None);
        vm.TypeChips.First().DisplayLabel.Should().Be("combat enemy_killed");
    }

    [Fact]
    public async Task EventTypeChip_with_non_bg3_prefix_keeps_full_label()
    {
        var (vm, q) = Build();
        q.EventTypes.Clear();
        q.EventTypes.Add("custom.event");
        await vm.LoadAsync(CancellationToken.None);
        vm.TypeChips.Single().DisplayLabel.Should().Be("custom.event");
    }
}

internal static class EventsVmAssertions
{
    public static void LastFilterShouldMatchTypes(this EventsViewModel _, string expectedType, StubQueryService q) =>
        q.LastFilter!.Types.Should().Contain(expectedType);
}
