using FluentAssertions;
using Reyn.Application.Ingestion;
using Reyn.Desktop.ViewModels.Overlay;
using Xunit;

namespace Reyn.Desktop.ViewModels.Tests.Overlay;

public sealed class OverlayViewModelTests
{
    [Fact]
    public void Defaults_to_invisible_with_placeholder_party_and_dashes_timer()
    {
        var vm = new OverlayViewModel();
        vm.IsVisible.Should().BeFalse();
        vm.SessionTimer.Should().Be("--:--");
        vm.Ticker.Should().BeEmpty();
        vm.PartyRings.Should().HaveCount(4);
    }

    [Fact]
    public void Updating_detection_state_with_detected_at_renders_mmss_timer()
    {
        var vm = new OverlayViewModel();
        var detectedAt = new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc);
        var now = detectedAt.AddSeconds(75);
        vm.UpdateDetectionState(new Bg3DetectionState(true, detectedAt), now);
        vm.IsVisible.Should().BeTrue();
        vm.SessionTimer.Should().Be("01:15");
    }

    [Fact]
    public void Negative_elapsed_clamps_to_zero()
    {
        var vm = new OverlayViewModel();
        var detectedAt = new DateTime(2026, 1, 1, 10, 0, 0, DateTimeKind.Utc);
        var now = detectedAt.AddSeconds(-10);
        vm.UpdateDetectionState(new Bg3DetectionState(true, detectedAt), now);
        vm.SessionTimer.Should().Be("00:00");
    }

    [Fact]
    public void Update_with_NotDetected_resets_timer_and_hides()
    {
        var vm = new OverlayViewModel();
        vm.UpdateDetectionState(new Bg3DetectionState(true, DateTime.UtcNow), DateTime.UtcNow);
        vm.IsVisible.Should().BeTrue();

        vm.UpdateDetectionState(Bg3DetectionState.NotDetected, DateTime.UtcNow);
        vm.IsVisible.Should().BeFalse();
        vm.SessionTimer.Should().Be("--:--");
    }

    [Fact]
    public void Ticker_caps_at_capacity_and_keeps_newest_on_top()
    {
        var vm = new OverlayViewModel();
        var t0 = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        vm.PushEvent("bg3.combat.enemy_killed", t0);
        vm.PushEvent("bg3.region.entered", t0.AddSeconds(1));
        vm.PushEvent("bg3.dialogue.choice_made", t0.AddSeconds(2));
        vm.PushEvent("bg3.rest.long", t0.AddSeconds(3));

        vm.Ticker.Should().HaveCount(OverlayViewModel.TickerCapacity);
        vm.Ticker[0].Label.Should().Be("long");
        vm.Ticker[OverlayViewModel.TickerCapacity - 1].Label.Should().Be("entered");
    }

    [Fact]
    public void Ticker_strips_bg3_prefix_and_category_for_label()
    {
        var vm = new OverlayViewModel();
        vm.PushEvent("bg3.combat.enemy_killed", DateTime.UtcNow);
        vm.Ticker[0].Label.Should().Be("enemy killed");
    }

    [Fact]
    public void Ticker_keeps_non_catalog_types_as_is()
    {
        var vm = new OverlayViewModel();
        vm.PushEvent("custom_event", DateTime.UtcNow);
        vm.Ticker[0].Label.Should().Be("custom_event");
    }

    [Fact]
    public void PartyRing_Fraction_handles_zero_max()
    {
        new PartyRing("test", 0, 0).Fraction.Should().Be(0);
    }
}
