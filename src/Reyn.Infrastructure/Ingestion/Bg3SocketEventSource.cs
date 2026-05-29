using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Reyn.Application.Ingestion;

namespace Reyn.Infrastructure.Ingestion;

/// <summary>
/// Listens on <c>127.0.0.1:35353</c> for the BG3 Script Extender Lua mod
/// (Phase 10). The mod opens a TCP connection and writes newline-delimited
/// JSON, one event per line: <c>{"type":"bg3.combat.enemy_killed","occurredAt":...,"payload":{...}}</c>.
///
/// Single-client; if a second client connects we drop the first. On
/// disconnect we restart the listener so the mod can reconnect after a
/// game restart without an app restart.
/// </summary>
public sealed partial class Bg3SocketEventSource(ILogger<Bg3SocketEventSource> log) : IGameEventSource
{
    public const int DefaultPort = 35353;

    public string SourceName => "bg3se";

    /// <summary>Loopback bind only — the mod runs on the same machine.</summary>
    public int Port { get; init; } = DefaultPort;

    public async IAsyncEnumerable<IncomingGameEvent> StreamAsync([EnumeratorCancellation] CancellationToken ct)
    {
        using var listener = new TcpListener(IPAddress.Loopback, Port);
        listener.Start();
        Log.Listening(log, Port);

        while (!ct.IsCancellationRequested)
        {
            TcpClient? client = null;
            try
            {
                client = await listener.AcceptTcpClientAsync(ct).ConfigureAwait(false);
                Log.Accepted(log);
            }
            catch (OperationCanceledException)
            {
                yield break;
            }
            catch (SocketException ex)
            {
                Log.AcceptFailed(log, ex);
                continue;
            }

            await foreach (var ev in ReadLinesAsync(client, ct).ConfigureAwait(false))
            {
                yield return ev;
            }
        }
    }

    private async IAsyncEnumerable<IncomingGameEvent> ReadLinesAsync(TcpClient client, [EnumeratorCancellation] CancellationToken ct)
    {
        using (client)
        using (var stream = client.GetStream())
        using (var reader = new StreamReader(stream))
        {
            while (!ct.IsCancellationRequested)
            {
                string? line;
                try
                {
                    line = await reader.ReadLineAsync(ct).ConfigureAwait(false);
                }
                catch (IOException ex)
                {
                    Log.ReadFailed(log, ex);
                    yield break;
                }
                if (line is null)
                {
                    Log.Disconnected(log);
                    yield break;
                }
                if (TryParseLine(line, out var ev))
                {
                    yield return ev;
                }
            }
        }
    }

    private bool TryParseLine(string line, out IncomingGameEvent ev)
    {
        ev = default!;
        try
        {
            using var doc = JsonDocument.Parse(line);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.String)
            {
                Log.Malformed(log, "missing type");
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
            Log.Malformed(log, ex.Message);
            return false;
        }
    }

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Information, Message = "Bg3SocketEventSource listening on loopback:{Port}")]
        public static partial void Listening(ILogger logger, int port);

        [LoggerMessage(Level = LogLevel.Information, Message = "Bg3SocketEventSource accepted client")]
        public static partial void Accepted(ILogger logger);

        [LoggerMessage(Level = LogLevel.Information, Message = "Bg3SocketEventSource client disconnected; awaiting reconnect")]
        public static partial void Disconnected(ILogger logger);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Bg3SocketEventSource accept failed")]
        public static partial void AcceptFailed(ILogger logger, Exception reason);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Bg3SocketEventSource read failed")]
        public static partial void ReadFailed(ILogger logger, Exception reason);

        [LoggerMessage(Level = LogLevel.Warning, Message = "Bg3SocketEventSource malformed line: {Reason}")]
        public static partial void Malformed(ILogger logger, string reason);
    }
}
