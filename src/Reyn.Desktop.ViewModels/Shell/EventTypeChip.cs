using CommunityToolkit.Mvvm.ComponentModel;

namespace Reyn.Desktop.ViewModels.Shell;

/// <summary>
/// One toggleable type filter chip. The EventsViewModel listens for
/// <see cref="EventTypeChip.PropertyChanged"/> on <see cref="IsSelected"/>
/// to re-run the events filter.
/// </summary>
public sealed partial class EventTypeChip : ObservableObject
{
    public EventTypeChip(string typeKey)
    {
        TypeKey = typeKey;
    }

    public string TypeKey { get; }

    /// <summary>Pretty label: "bg3.combat.enemy_killed" → "combat · enemy_killed".</summary>
    public string DisplayLabel => FormatLabel(TypeKey);

    [ObservableProperty]
    private bool _isSelected;

    private static string FormatLabel(string typeKey)
    {
        if (typeKey.StartsWith("bg3.", StringComparison.Ordinal))
        {
            return typeKey.Substring(4).Replace('.', ' ');
        }
        return typeKey;
    }
}
