using Microsoft.AspNetCore.Mvc;
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
        [HttpGet("{**path}")]
        public async Task<IActionResult> Get(string path)
        {
            var (status, body) = await proxy.ForwardAsync("/" + path, "GET");
            return StatusCode(status, body);
        }
    }
}
