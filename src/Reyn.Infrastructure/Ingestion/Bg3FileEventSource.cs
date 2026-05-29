using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Reyn.Application.Ingestion;

namespace Reyn.Infrastructure.Ingestion;

/// <summary>
/// Watches the JSONL file written by the Phase 10 BG3SE Lua mod
/// (<c>%LocalAppData%\…\Script Extender\Reyn\bg3-events.jsonl</c>) and
/// emits each new line as an <see cref="IncomingGameEvent"/>.
///
/// Implementation: polls the file size on a configurable interval (default
/// 500ms), reads only the bytes after the last-known offset, splits on
/// '\n' and parses each complete line. BG3SE writes with
/// <c>Ext.IO.AppendFile</c>, which is atomic at the FS level — so partial
/// lines past the offset are rare; when they happen we hold them in a
/// pending buffer until the next tick.
/// </summary>
public sealed partial class Bg3FileEventSource : IGameEventSource
{
    private readonly ILogger<Bg3FileEventSource> _log;
    private readonly Bg3FileEventSourceOptions _options;

    public Bg3FileEventSource(IOptions<Bg3FileEventSourceOptions> options, ILogger<Bg3FileEventSource> log)
    {
        _log = log;
        _options = options.Value;
    }

    public string SourceName => "bg3se-file";

    public async IAsyncEnumerable<IncomingGameEvent> StreamAsync([EnumeratorCancellation] CancellationToken ct)
    {
        var path = _options.Path;
        Log.Watching(_log, path);

        long offset = 0;
        var pending = string.Empty;

        // On startup, skip existing content — we don't want to re-emit the
        // whole history every desktop restart. If the user wants to backfill
        // they'll use /v1/sync/pull.
        if (File.Exists(path))
        {
            offset = new FileInfo(path).Length;
        }

        while (!ct.IsCancellationRequested)
        {
            // ReadCycle does the IO + parsing; this method does the
            // yields. C# forbids yielding inside try-with-catch, so
            // exception handling stays in ReadCycle.
            var cycle = await ReadCycle(path, offset, pending, ct).ConfigureAwait(false);
            if (cycle.Cancelled)
            {
                yield break;
            }
            offset = cycle.Offset;
            pending = cycle.Pending;
            foreach (var ev in cycle.Lines)
            {
                yield return ev;
            }

            if (!await DelayAsync(_options.PollInterval, ct).ConfigureAwait(false))
            {
                yield break;
            }
        }
    }

    private async Task<ReadCycleResult> ReadCycle(string path, long offset, string pending, CancellationToken ct)
    {
        var lines = new List<IncomingGameEvent>();
        try
        {
            if (!File.Exists(path))
            {
                return new ReadCycleResult(lines, offset, pending, false);
            }

            var info = new FileInfo(path);
            if (info.Length < offset)
            {
                Log.Truncated(_log, path);
                offset = 0;
                pending = string.Empty;
            }

            if (info.Length == offset)
            {
                return new ReadCycleResult(lines, offset, pending, false);
            }

            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            stream.Seek(offset, SeekOrigin.Begin);
            using var reader = new StreamReader(stream);
            var content = await reader.ReadToEndAsync(ct).ConfigureAwait(false);
            offset = info.Length;

            var buffer = pending + content;
            var splitAt = buffer.LastIndexOf('\n');
            if (splitAt < 0)
            {
                pending = buffer;
            }
            else
            {
                pending = buffer.Substring(splitAt + 1);
                var ready = buffer.Substring(0, splitAt);
                foreach (var line in ready.Split('\n'))
                {
                    if (string.IsNullOrWhiteSpace(line))
                    {
                        continue;
                    }
                    if (TryParseLine(line, out var ev))
                    {
                        lines.Add(ev);
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            return new ReadCycleResult(lines, offset, pending, true);
        }
        catch (IOException ex)
        {
            Log.IoError(_log, ex);
        }
        return new ReadCycleResult(lines, offset, pending, false);
    }

    private static async Task<bool> DelayAsync(TimeSpan delay, CancellationToken ct)
    {
        try
        {
            await Task.Delay(delay, ct).ConfigureAwait(false);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    private sealed record ReadCycleResult(IReadOnlyList<IncomingGameEvent> Lines, long Offset, string Pending, bool Cancelled);

    internal bool TryParseLine(string line, out IncomingGameEvent ev)
    {
        ev = default!;
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.String)
            {
                Log.Malformed(_log, "missing type");
                return false;
            }
            var type = typeEl.GetString()!;

            DateTime occurredAt;
            if (root.TryGetProperty("occurredAt", out var atEl))
            {
                occurredAt = atEl.ValueKind switch
                {
                    JsonValueKind.Number => DateTimeOffset.FromUnixTimeMilliseconds(atEl.GetInt64()).UtcDateTime,
                    JsonValueKind.String when DateTime.TryParse(atEl.GetString(), out var parsed) => parsed.ToUniversalTime(),
                    _ => DateTime.UtcNow,
                };
            }
            else
            {
                occurredAt = DateTime.UtcNow;
            }

            var payloadJson = root.TryGetProperty("payload", out var payloadEl)
                ? payloadEl.GetRawText()
                : """{"source":"bg3se"}""";

            ev = new IncomingGameEvent(type, occurredAt, payloadJson);
            return true;
        }
        catch (JsonException ex)
        {
            Log.Malformed(_log, ex.Message);
            return false;
        }
    }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Information, Message = "Bg3FileEventSource watching {Path}")]
        public static partial void Watching(ILogger logger, string path);

        [LoggerMessage(Level = LogLevel.Information, Message = "Bg3FileEventSource detected truncation; restarting at offset 0 ({Path})")]
        public static partial void Truncated(ILogger logger, string path);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Bg3FileEventSource read failed")]
        public static partial void IoError(ILogger logger, Exception reason);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Bg3FileEventSource malformed line: {Reason}")]
        public static partial void Malformed(ILogger logger, string reason);
    }
}

/// <summary>Tunables for the file watcher.</summary>
public sealed class Bg3FileEventSourceOptions
{
    /// <summary>Absolute path to the JSONL the mod writes.</summary>
    public string Path { get; init; } = DefaultPath();

    /// <summary>How often to check for new bytes. Default 500ms.</summary>
    public TimeSpan PollInterval { get; init; } = TimeSpan.FromMilliseconds(500);

    public static string DefaultPath() => System.IO.Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Larian Studios",
        "Baldur's Gate 3",
        "Script Extender",
        "Reyn",
        "bg3-events.jsonl");
}
