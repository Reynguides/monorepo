using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Overlay_in_game_WPF
{
    public class RequestLog
    {
        public int Id { get; set; }
        public string UserId { get; set; } = "";
        public string Method { get; set; } = "";
        public string Path { get; set; } = "";
        public int StatusCode { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public bool IsDeleted { get; set; } = false;
        public DateTime? SyncedAt { get; set; }  // null = not yet sync
    }
}
