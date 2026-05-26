using Microsoft.Extensions.Hosting;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Overlay_in_game_WPF;

public class KnowledgeBaseEntry
{
    [JsonPropertyName("tags")]
    public string[] Tags { get; set; } = [];

    [JsonPropertyName("content")]
    public string Content { get; set; } = string.Empty;
}

public class KnowledgeBase
{
    private List<KnowledgeBaseEntry> entries = [];
    private readonly string filePath;

    public KnowledgeBase(string filePath = "kb.json")
    {
        this.filePath = filePath;
        LoadFromFile();
    }

    private void LoadFromFile()
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Knowledge base file not found: {filePath}");
        }

        try
        {
            string json = File.ReadAllText(filePath);
            var loadedEntries = JsonSerializer.Deserialize<List<KnowledgeBaseEntry>>(json) ?? [];
            entries = loadedEntries;
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException($"Error parsing knowledge base JSON: {ex.Message}", ex);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Error loading knowledge base: {ex.Message}", ex);
        }
    }

    // returns top-3 entries where most tags intersect with the given keywords
    public List<KnowledgeBaseEntry> Search(string[] keywords)
    {
        if (keywords == null || keywords.Length == 0)
        {
            return [];
        }

        var keywordSet = new HashSet<string>(keywords, StringComparer.OrdinalIgnoreCase);

        var results = entries
            .Select(entry => new
            {
                Entry = entry,
                IntersectionCount = entry.Tags
                    .Count(tag => keywordSet.Contains(tag))
            })
            .Where(x => x.IntersectionCount > 0)
            .OrderByDescending(x => x.IntersectionCount)
            .Take(3)
            .Select(x => x.Entry)
            .ToList();

        return results;
    }
}
