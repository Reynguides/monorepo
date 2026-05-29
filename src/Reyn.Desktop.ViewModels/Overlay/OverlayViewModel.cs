using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Reyn.Application.Ingestion;

namespace Reyn.Desktop.ViewModels.Overlay;

/// <summary>
/// Bindable state for the click-through HUD. The shell-side window
/// subscribes to <see cref="IGameEventSource"/> + <see cref="IBg3DetectionPublisher"/>
/// and pushes through the public <see cref="PushEvent"/> /
/// <see cref="UpdateDetectionState"/> entry points on the UI thread.
/// </summary>
public sealed partial class OverlayViewModel : ObservableObject
{
    public const int TickerCapacity = 3;

    /// <summary>How long the current session has been live (in mm:ss).</summary>
    [ObservableProperty]
    private string _sessionTimer = "--:--";

    /// <summary>Last few events scrolling through the ticker; newest first.</summary>
    public ObservableCollection<TickerLine> Ticker { get; } = new();

    /// <summary>Mocked party HP rings — 4 placeholder slots Phase 11 wires to real values.</summary>
    public ObservableCollection<PartyRing> PartyRings { get; } =
        new()
        {
            new PartyRing("Tav", 28, 32),
            new PartyRing("Shadowheart", 22, 26),
            new PartyRing("Astarion", 19, 24),
            new PartyRing("Karlach", 35, 40),
        };

    /// <summary>True iff the overlay should be rendered (i.e. BG3 is detected).</summary>
    [ObservableProperty]
    private bool _isVisible;

    /// <summary>
    /// Push one event onto the ticker. Caller is responsible for dispatching
    /// to the UI thread before invoking this; the VM is pure model state.
    /// </summary>
    public void PushEvent(string type, DateTime occurredAt)
    {
        Ticker.Insert(0, new TickerLine(FormatTime(occurredAt), FormatType(type)));
        while (Ticker.Count > TickerCapacity)
        {
            Ticker.RemoveAt(Ticker.Count - 1);
        }
    }

    /// <summary>
    /// Update the session timer + visibility from the detector. <c>now</c>
    /// is injected so tests can pin the clock; production passes
    /// <c>DateTime.UtcNow</c>.
    /// </summary>
    public void UpdateDetectionState(Bg3DetectionState state, DateTime now)
    {
        IsVisible = state.IsDetected;
        if (state.DetectedAtUtc is { } detectedAt)
        {
            var elapsed = now - detectedAt;
            if (elapsed < TimeSpan.Zero)
            {
                elapsed = TimeSpan.Zero;
            }
            SessionTimer = $"{(int)elapsed.TotalMinutes:D2}:{elapsed.Seconds:D2}";
        }
        else
        {
            SessionTimer = "--:--";
        }
    }

    private static string FormatTime(DateTime occurredAt) =>
        occurredAt.ToLocalTime().ToString("HH:mm:ss", System.Globalization.CultureInfo.InvariantCulture);

    private static string FormatType(string type)
    {
        // Strip the catalog prefix; "bg3.combat.enemy_killed" → "enemy killed".
        if (type.StartsWith("bg3.", StringComparison.Ordinal))
        {
            type = type.Substring(4);
        }
        var lastDot = type.LastIndexOf('.');
        return lastDot < 0 ? type : type.Substring(lastDot + 1).Replace('_', ' ');
    }
}

public sealed record TickerLine(string Time, string Label);

public sealed record PartyRing(string Name, int Hp, int MaxHp)
{
    public double Fraction => MaxHp == 0 ? 0 : (double)Hp / MaxHp;
}
