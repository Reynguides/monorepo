using System.Net.Sockets;
using System.Text;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Reyn.Application.Ingestion;
using Reyn.Contracts.Events;
using Reyn.Infrastructure.Ingestion;
using Xunit;

namespace Reyn.Application.Tests.Ingestion;

public sealed class Bg3SocketEventSourceTests
{
    private static int NextPort() => Random.Shared.Next(40000, 50000);

    private static Bg3SocketEventSource MakeSource(int port) =>
        new(NullLogger<Bg3SocketEventSource>.Instance) { Port = port };

    private static async Task WriteLineToSocketAsync(int port, string line, CancellationToken ct)
    {
        // Retry briefly while the server starts listening.
        for (var attempt = 0; attempt < 20; attempt++)
        {
            try
            {
                using var client = new TcpClient();
                await client.ConnectAsync("127.0.0.1", port, ct);
                using var stream = client.GetStream();
                var bytes = Encoding.UTF8.GetBytes(line + "\n");
                await stream.WriteAsync(bytes, ct);
                await stream.FlushAsync(ct);
                return;
            }
            catch (SocketException)
            {
                await Task.Delay(50, ct);
            }
        }
        throw new InvalidOperationException($"Could not connect to loopback:{port}");
    }

    [Fact]
    public void SourceName_is_bg3se()
    {
        MakeSource(NextPort()).SourceName.Should().Be("bg3se");
    }

    [Fact]
    public async Task Reads_newline_delimited_JSON_and_emits_event()
    {
        var port = NextPort();
        var source = MakeSource(port);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var writeTask = Task.Run(async () =>
        {
            await Task.Delay(150, cts.Token);
            await WriteLineToSocketAsync(port,
                """{"type":"bg3.combat.enemy_killed","occurredAt":1700000000000,"payload":{"source":"bg3se","enemy":"Goblin"}}""",
                cts.Token);
        });

        IncomingGameEvent? captured = null;
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            captured = ev;
            break;
        }
        await writeTask;

        captured.Should().NotBeNull();
        captured!.Type.Should().Be(Bg3EventTypes.EnemyKilled);
        captured.PayloadJson.Should().Contain("Goblin");
    }

    [Fact]
    public async Task Malformed_line_is_skipped_but_subsequent_lines_emit()
    {
        var port = NextPort();
        var source = MakeSource(port);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var writeTask = Task.Run(async () =>
        {
            await Task.Delay(150, cts.Token);
            // Two lines: garbage + a valid event. Garbage is dropped.
            using var client = new TcpClient();
            await client.ConnectAsync("127.0.0.1", port, cts.Token);
            using var stream = client.GetStream();
            var bytes = Encoding.UTF8.GetBytes(
                "{not-json\n" +
                """{"type":"bg3.region.entered","occurredAt":"2026-05-29T12:00:00Z","payload":{"source":"bg3se","region":"Druid Grove"}}""" + "\n");
            await stream.WriteAsync(bytes, cts.Token);
            await stream.FlushAsync(cts.Token);
        });

        IncomingGameEvent? captured = null;
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            captured = ev;
            break;
        }
        await writeTask;

        captured.Should().NotBeNull();
        captured!.Type.Should().Be(Bg3EventTypes.RegionEntered);
    }

    [Fact]
    public async Task Stream_terminates_when_cancellation_requested()
    {
        var port = NextPort();
        var source = MakeSource(port);
        using var cts = new CancellationTokenSource();
        cts.CancelAfter(TimeSpan.FromMilliseconds(250));

        var events = new List<IncomingGameEvent>();
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            events.Add(ev);
        }
        events.Should().BeEmpty();
    }

    [Fact]
    public async Task Event_without_payload_defaults_to_bg3se_source_object()
    {
        var port = NextPort();
        var source = MakeSource(port);
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));

        var writeTask = Task.Run(async () =>
        {
            await Task.Delay(150, cts.Token);
            await WriteLineToSocketAsync(port,
                """{"type":"bg3.rest.long"}""",
                cts.Token);
        });

        IncomingGameEvent? captured = null;
        await foreach (var ev in source.StreamAsync(cts.Token))
        {
            captured = ev;
            break;
        }
        await writeTask;

        captured.Should().NotBeNull();
        captured!.PayloadJson.Should().Contain("bg3se");
    }
}
