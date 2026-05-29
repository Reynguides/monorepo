using System.IO;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Reyn.Application.Ingestion;
using Reyn.Contracts.Events;
using Reyn.Infrastructure.Ingestion;
using Xunit;

namespace Reyn.Application.Tests.Ingestion;

public sealed class Bg3FileEventSourceTests : IDisposable
{
    private readonly string _path;

    public Bg3FileEventSourceTests()
    {
        _path = Path.Combine(Path.GetTempPath(), $"reyn-bg3-events-{Guid.NewGuid():N}.jsonl");
    }

    public void Dispose()
    {
        if (File.Exists(_path)) File.Delete(_path);
    }

    private Bg3FileEventSource MakeSource(TimeSpan? poll = null) =>
        new(Options.Create(new Bg3FileEventSourceOptions
        {
            Path = _path,
            PollInterval = poll ?? TimeSpan.FromMilliseconds(40),
        }), NullLogger<Bg3FileEventSource>.Instance);

    private static async Task AppendLineAsync(string path, string line)
    {
        await File.AppendAllTextAsync(path, line + "\n", Encoding.UTF8);
    }

    [Fact]
    public void Source_name_is_bg3se_file()
    {
        MakeSource().SourceName.Should().Be("bg3se-file");
    }

    [Fact]
    public async Task Emits_appended_lines_as_events()
    {
        File.WriteAllText(_path, string.Empty); // empty file, source skips existing
        var source = MakeSource();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var writerTask = Task.Run(async () =>
        {
            await Task.Delay(150, cts.Token);
            await AppendLineAsync(_path,
                """{"type":"bg3.character.died","occurredAt":1700000000000,"payload":{"source":"bg3se","characterId":"tav-1"}}""");
        });

        IncomingGameEvent? captured = null;
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            captured = ev;
            break;
        }
        await writerTask;

        captured.Should().NotBeNull();
        captured!.Type.Should().Be(Bg3EventTypes.CharacterDied);
        captured.PayloadJson.Should().Contain("tav-1");
    }

    [Fact]
    public async Task Skips_existing_content_on_startup()
    {
        // Pre-populate the file BEFORE starting the source. Those lines
        // must NOT be emitted (otherwise every desktop restart would
        // replay the whole history).
        await AppendLineAsync(_path,
            """{"type":"bg3.combat.enemy_killed","occurredAt":1700000000000,"payload":{"source":"bg3se","enemy":"Goblin"}}""");

        var source = MakeSource();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));

        var collected = new List<IncomingGameEvent>();
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            collected.Add(ev);
        }
        collected.Should().BeEmpty("pre-existing lines must not be re-emitted");
    }

    [Fact]
    public async Task Restarts_at_offset_zero_on_truncation()
    {
        await AppendLineAsync(_path, """{"type":"bg3.region.entered","payload":{"source":"bg3se","region":"old"}}""");
        var source = MakeSource();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var writerTask = Task.Run(async () =>
        {
            await Task.Delay(150, cts.Token);
            // Truncate + write a brand-new line. The watcher should pick
            // up the new line.
            File.WriteAllText(_path,
                """{"type":"bg3.region.entered","payload":{"source":"bg3se","region":"new"}}""" + "\n");
        });

        IncomingGameEvent? captured = null;
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            captured = ev;
            break;
        }
        await writerTask;

        captured.Should().NotBeNull();
        captured!.PayloadJson.Should().Contain("new");
    }

    [Fact]
    public async Task Malformed_line_is_skipped_but_next_valid_line_emits()
    {
        File.WriteAllText(_path, string.Empty);
        var source = MakeSource();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var writerTask = Task.Run(async () =>
        {
            await Task.Delay(150, cts.Token);
            // Append garbage then a valid line. The watcher emits one event.
            await File.AppendAllTextAsync(_path,
                "{not-json\n" +
                """{"type":"bg3.quest.completed","payload":{"source":"bg3se","quest":"Find the missing druids"}}""" + "\n",
                Encoding.UTF8);
        });

        IncomingGameEvent? captured = null;
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            captured = ev;
            break;
        }
        await writerTask;

        captured.Should().NotBeNull();
        captured!.Type.Should().Be(Bg3EventTypes.QuestCompleted);
    }

    [Fact]
    public async Task File_that_does_not_exist_is_polled_until_creation()
    {
        // No file. Source should not throw; it just waits.
        var source = MakeSource();
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));
        var collected = new List<IncomingGameEvent>();
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            collected.Add(ev);
        }
        collected.Should().BeEmpty();
    }

    [Fact]
    public void DefaultPath_uses_LocalAppData_under_Larian_Script_Extender()
    {
        var path = Bg3FileEventSourceOptions.DefaultPath();
        path.Should().Contain("Larian Studios");
        path.Should().Contain("Script Extender");
        path.Should().EndWith("bg3-events.jsonl");
    }

    [Fact]
    public void TryParseLine_handles_missing_type_field()
    {
        var source = MakeSource();
        var parsed = source.TryParseLine("""{"payload":{}}""", out _);
        parsed.Should().BeFalse();
    }

    [Fact]
    public void TryParseLine_accepts_iso_string_occurredAt()
    {
        var source = MakeSource();
        var parsed = source.TryParseLine(
            """{"type":"bg3.region.entered","occurredAt":"2026-05-29T12:00:00Z","payload":{"source":"bg3se","region":"x"}}""",
            out var ev);
        parsed.Should().BeTrue();
        ev.OccurredAt.Year.Should().Be(2026);
    }

    [Fact]
    public void TryParseLine_defaults_payload_to_bg3se_source()
    {
        var source = MakeSource();
        var parsed = source.TryParseLine("""{"type":"bg3.rest.long"}""", out var ev);
        parsed.Should().BeTrue();
        ev.PayloadJson.Should().Contain("bg3se");
    }
}
