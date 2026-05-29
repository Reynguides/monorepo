using System.Collections.ObjectModel;
using Reyn.Application.Queries;

namespace Reyn.Desktop.ViewModels.Shell;

public sealed class AchievementsViewModel(IGameEventQueryService queries) : PageViewModelBase
{
    public override string Title => "Achievements";

    public override string Subtitle => "Progress towards every catalog goal.";

    public ObservableCollection<AchievementProgress> Achievements { get; } = new();

    public int UnlockedCount => Achievements.Count(a => a.Unlocked);

    public int TotalCount => Achievements.Count;

    public override async Task LoadAsync(CancellationToken ct)
    {
        State = PageState.Loading;
        ErrorMessage = null;
        try
        {
            var rows = await queries.GetAchievementsAsync(ct).ConfigureAwait(true);
            Achievements.Clear();
            foreach (var row in rows) Achievements.Add(row);
            OnPropertyChanged(nameof(UnlockedCount));
            OnPropertyChanged(nameof(TotalCount));
            State = Achievements.Count == 0 ? PageState.Empty : PageState.Ready;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
            State = PageState.Error;
        }
    }
}
