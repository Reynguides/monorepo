using System.Net.Http;
using Reyn.Infrastructure.Persistence;

namespace Reyn.Infrastructure.Http;

public class ProxyService(HttpClient http, ReynDbContext db)
{
    private const string Upstream = "https://jsonplaceholder.typicode.com";

    public async Task<(int Status, string Body)> ForwardAsync(string path, string method, SyncService sync)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), Upstream + path);
        using var response = await http.SendAsync(request).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);

        db.Logs.Add(new RequestLog
        {
            Method = method,
            Path = path,
            StatusCode = (int)response.StatusCode,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync().ConfigureAwait(false);
        await sync.PushAsync().ConfigureAwait(false);

        return ((int)response.StatusCode, body);
    }
}
