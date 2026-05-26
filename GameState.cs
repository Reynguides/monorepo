using System.Text.Json.Serialization;

namespace Overlay_in_game_WPF
{
    public class GameState
    {
        [JsonPropertyName("hero")]
        public Hero Hero { get; set; } = new();

        [JsonPropertyName("map")]
        public Map Map { get; set; } = new();
    }

    public class Hero
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("health_percent")]
        public int HealthPercent { get; set; }
    }

    public class Map
    {
        [JsonPropertyName("game_time")]
        public int GameTime { get; set; }
    }
}
