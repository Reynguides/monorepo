using System.Net.Http;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Reyn.Infrastructure.Persistence;

namespace Reyn.Infrastructure.Http;

public class SyncService(HttpClient http, AppDbContext db)
{
    private const string WorkerUrl = "https://syncworker.oleksandr-delas.workers.dev";
    private const string UserId = "user1"; // Phase 5 replaces with ICurrentUserAccessor.

    public async Task PushAsync()
    {
        var unsync = await db.Logs
            .Where(l => l.SyncedAt == null)
            .ToListAsync().ConfigureAwait(false);

        if (unsync.Count == 0)
        {
            return;
        }

        var payload = unsync.Select(l => new
        {
            id = l.Id,
            userId = UserId,
            method = l.Method,
            path = l.Path,
            statusCode = l.StatusCode,
            updatedAt = l.UpdatedAt.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
        });

        var response = await http.PostAsJsonAsync($"{WorkerUrl}/sync/push", payload).ConfigureAwait(false);

        if (response.IsSuccessStatusCode)
        {
            foreach (var log in unsync)
            {
                log.SyncedAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync().ConfigureAwait(false);
        }
    }
}
