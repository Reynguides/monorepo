using System.Net;
using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Reyn.Application.Sync;
using Reyn.Infrastructure.Http;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;
using Xunit;

namespace Reyn.Application.Tests.Sync;

public sealed class HttpEventSyncClientTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly HttpClient _http;

    public HttpEventSyncClientTests()
    {
        _server = WireMockServer.Start();
        _http = new HttpClient();
    }

    public void Dispose()
    {
        _http.Dispose();
        _server.Dispose();
    }

    private HttpEventSyncClient BuildClient(string? token = "tok")
    {
        var tokens = new StubTokens(token);
        var options = Options.Create(new SyncOptions { WorkerBaseAddress = new Uri(_server.Urls[0]) });
        return new HttpEventSyncClient(_http, tokens, NullLogger<HttpEventSyncClient>.Instance, options);
    }

    [Fact]
    public async Task PushAsync_sends_bearer_and_idempotency_key()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/push").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("""{"accepted":1,"duplicates":0}"""));

        var client = BuildClient();
        var result = await client.PushAsync(
            new[] { new EventPayload(Guid.NewGuid(), "t", 1, "{}") },
            "key-1",
            CancellationToken.None);

        result.Should().Be(new PushResult(1, 0));
        var logged = _server.LogEntries.Single();
        logged.RequestMessage.Headers!["Authorization"][0].Should().Be("Bearer tok");
        logged.RequestMessage.Headers!["Idempotency-Key"][0].Should().Be("key-1");
    }

    [Fact]
    public async Task PushAsync_throws_SyncAuthException_when_token_missing()
    {
        var client = BuildClient(token: null);
        var act = async () => await client.PushAsync(
            Array.Empty<EventPayload>(),
            "k",
            CancellationToken.None);
        await act.Should().ThrowAsync<SyncAuthException>();
    }

    [Fact]
    public async Task PushAsync_maps_500_to_SyncTransientException()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/push").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(503).WithBody("nope"));
        var client = BuildClient();
        var act = async () => await client.PushAsync(
            new[] { new EventPayload(Guid.NewGuid(), "t", 1, "{}") },
            "k",
            CancellationToken.None);
        await act.Should().ThrowAsync<SyncTransientException>();
    }

    [Fact]
    public async Task PushAsync_maps_401_to_SyncAuthException()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/push").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(401));
        var client = BuildClient();
        var act = async () => await client.PushAsync(
            new[] { new EventPayload(Guid.NewGuid(), "t", 1, "{}") },
            "k",
            CancellationToken.None);
        await act.Should().ThrowAsync<SyncAuthException>();
    }

    [Fact]
    public async Task PushAsync_maps_403_to_SyncAuthException()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/push").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(403));
        var client = BuildClient();
        var act = async () => await client.PushAsync(
            new[] { new EventPayload(Guid.NewGuid(), "t", 1, "{}") },
            "k",
            CancellationToken.None);
        await act.Should().ThrowAsync<SyncAuthException>();
    }

    [Fact]
    public async Task PushAsync_maps_400_to_SyncPermanentException()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/push").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(400));
        var client = BuildClient();
        var act = async () => await client.PushAsync(
            new[] { new EventPayload(Guid.NewGuid(), "t", 1, "{}") },
            "k",
            CancellationToken.None);
        await act.Should().ThrowAsync<SyncPermanentException>();
    }

    [Fact]
    public async Task PushAsync_throws_on_empty_body()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/push").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Length", "0"));
        var client = BuildClient();
        var act = async () => await client.PushAsync(
            new[] { new EventPayload(Guid.NewGuid(), "t", 1, "{}") },
            "k",
            CancellationToken.None);
        await act.Should().ThrowAsync<SyncTransientException>();
    }

    [Fact]
    public async Task PullAsync_returns_items_and_cursor()
    {
        var eid = Guid.NewGuid();
        var payload = $$"""
        {
          "items": [{
            "eventId":"{{eid}}",
            "type":"t",
            "occurredAt":1,
            "payloadJson":"{}",
            "contentHash":"h",
            "receivedAt":2,
            "cursor":7
          }],
          "nextCursor": null
        }
        """;
        _server.Given(Request.Create().WithPath("/v1/sync/pull").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody(payload));

        var client = BuildClient();
        var page = await client.PullAsync(null, 10, CancellationToken.None);
        page.Items.Should().HaveCount(1);
        page.Items[0].EventId.Should().Be(eid);
        page.NextCursor.Should().BeNull();
    }

    [Fact]
    public async Task PullAsync_appends_since_when_cursor_provided()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/pull").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("""{"items":[],"nextCursor":null}"""));
        var client = BuildClient();
        await client.PullAsync(42, 10, CancellationToken.None);
        var logged = _server.LogEntries.Single();
        logged.RequestMessage.Url.Should().Contain("since=42");
        logged.RequestMessage.Url.Should().Contain("limit=10");
    }

    [Fact]
    public async Task PullAsync_throws_on_empty_body()
    {
        _server.Given(Request.Create().WithPath("/v1/sync/pull").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Length", "0"));
        var client = BuildClient();
        var act = async () => await client.PullAsync(null, 10, CancellationToken.None);
        await act.Should().ThrowAsync<SyncTransientException>();
    }

    private sealed class StubTokens(string? token) : IAuthTokenSource
    {
        public Task<string?> GetTokenAsync(CancellationToken ct) => Task.FromResult(token);
    }
}

