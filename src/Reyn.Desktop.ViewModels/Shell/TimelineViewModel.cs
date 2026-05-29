using System.Collections.ObjectModel;
using Reyn.Application.Queries;

namespace Reyn.Desktop.ViewModels.Shell;

public sealed class TimelineViewModel(IGameEventQueryService queries) : PageViewModelBase
{
    public override string Title => "Timeline";

    public override string Subtitle => "Sessions in chronological order, newest first.";

    public ObservableCollection<TimelineSession> Sessions { get; } = new();

    public override async Task LoadAsync(CancellationToken ct)
    {
        State = PageState.Loading;
        ErrorMessage = null;
        try
        {
            var rows = await queries.GetTimelineAsync(20, 50, ct).ConfigureAwait(true);
            Sessions.Clear();
            foreach (var row in rows) Sessions.Add(row);
            State = Sessions.Count == 0 ? PageState.Empty : PageState.Ready;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
            State = PageState.Error;
        }
    }
}
