using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Overlay_in_game_WPF
{
    [ApiController]
    [Route("proxy")]
    public class ProxyController(ProxyService proxy) : ControllerBase
    {
        private readonly SyncService _sync = App.Services.GetRequiredService<SyncService>();

        [HttpGet("{**path}")]
        public async Task<IActionResult> Get(string path)
        {
            var (status, body) = await proxy.ForwardAsync("/" + path, "GET", _sync);
            return StatusCode(status, body);
        }
    }
}
