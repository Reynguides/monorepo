using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace Overlay_in_game_WPF
{
    public class ProxyService(HttpClient http, AppDbContext db)
    {
        private const string Upstream = "https://jsonplaceholder.typicode.com";

        public async Task<(int status, string body)> ForwardAsync(string path, string method)
        {
            var request = new HttpRequestMessage(new HttpMethod(method), Upstream + path);
            var response = await http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();

            db.Logs.Add(new RequestLog {
                Method = method,
                Path = path,
                StatusCode = (int)response.StatusCode
            });
            await db.SaveChangesAsync();

            return ((int)response.StatusCode, body);
        }
    }
}
