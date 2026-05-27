using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Threading.Tasks;

namespace Overlay_in_game_WPF
{
    public class SyncService(HttpClient http, AppDbContext db)
    {
        private const string WorkerUrl = "https://syncworker.oleksandr-delas.workers.dev";
        private const string UserId = "user1"; // TODO: replace with a real one

        public async Task PushAsync()
        {
            var unsync = await db.Logs
                .Where(l => l.SyncedAt == null)
                .ToListAsync();

            if (!unsync.Any()) return;

            var payload = unsync.Select(l => new {
                id = l.Id,
                userId = UserId,
                method = l.Method,
                path = l.Path,
                statusCode = l.StatusCode,
                updatedAt = l.UpdatedAt.ToString("o")
            });

            var response = await http.PostAsJsonAsync($"{WorkerUrl}/sync/push", payload);

            if (response.IsSuccessStatusCode)
            {
                foreach (var log in unsync)
                    log.SyncedAt = DateTime.UtcNow;
                await db.SaveChangesAsync();
            }
        }
    }
}
