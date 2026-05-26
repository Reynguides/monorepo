using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Overlay_in_game_WPF
{
    public static class ContextBuilder
    {
        public static string BuildContext(GameState state)
        {
            if (state?.Hero == null || state?.Map == null)
                return string.Empty;

            var heroName = state.Hero.Name ?? "Unknown";
            var hp = state.Hero.HealthPercent;
            var gameTimeMinutes = state.Map.GameTime / 60;

            return $"Hero: {heroName}, HP: {hp}%, game time: {gameTimeMinutes} min";
        }
        
        // extracts keywords from the game state,
        // returns an array containing the hero name and "low-hp" if health < 30%
        public static string[] ExtractKeywords(GameState state)
        {
            var keywords = new List<string>();

            if (state?.Hero == null)
                return keywords.ToArray();

            var heroName = state.Hero.Name ?? string.Empty;
            var formattedHeroName = heroName.ToLower();
            formattedHeroName = Regex.Replace(formattedHeroName, @"\s+", "-");
            
            if (!string.IsNullOrEmpty(formattedHeroName))
                keywords.Add(formattedHeroName);

            // Add "low-hp" keyword if health is below 30%
            if (state.Hero.HealthPercent < 30)
                keywords.Add("low-hp");

            return keywords.ToArray();
        }
    }
}
