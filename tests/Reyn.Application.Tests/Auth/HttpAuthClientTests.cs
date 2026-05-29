using System.Net;
using System.Net.Http;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Reyn.Application.Auth;
using Reyn.Application.Sync;
using Reyn.Infrastructure.Http;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;
using Xunit;

namespace Reyn.Application.Tests.Auth;

public sealed class HttpAuthClientTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly HttpClient _http;

    public HttpAuthClientTests()
    {
        _server = WireMockServer.Start();
        _http = new HttpClient();
    }

    public void Dispose()
    {
        _http.Dispose();
        _server.Dispose();
    }

    private HttpAuthClient BuildClient()
    {
        var options = Options.Create(new SyncOptions { WorkerBaseAddress = new Uri(_server.Urls[0]) });
        return new HttpAuthClient(_http, NullLogger<HttpAuthClient>.Instance, options);
    }

    [Fact]
    public async Task RegisterAsync_returns_AuthResult_on_201()
    {
        var expiresAt = DateTime.UtcNow.AddDays(30);
        _server.Given(Request.Create().WithPath("/v1/auth/register").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(201).WithBody($$"""{"userId":"u1","token":"t1","expiresAt":"{{expiresAt:O}}"}"""));

        var result = await BuildClient().RegisterAsync("a@b.io", "Hunter2longenough!", CancellationToken.None);
        result.UserId.Should().Be("u1");
        result.Token.Should().Be("t1");
        result.ExpiresAt.Should().BeCloseTo(expiresAt, TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task RegisterAsync_maps_409_to_EmailAlreadyExistsException()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/register").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(409).WithBody("""{"error":"email_already_exists"}"""));

        var act = async () => await BuildClient().RegisterAsync("a@b.io", "Hunter2longenough!", CancellationToken.None);
        await act.Should().ThrowAsync<EmailAlreadyExistsException>();
    }

    [Fact]
    public async Task RegisterAsync_maps_400_to_AuthValidationException()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/register").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(400).WithBody("""{"error":"validation_failed","issues":[]}"""));
        var act = async () => await BuildClient().RegisterAsync("bad", "short", CancellationToken.None);
        await act.Should().ThrowAsync<AuthValidationException>();
    }

    [Fact]
    public async Task LoginAsync_maps_401_to_InvalidCredentialsException()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/login").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(401));
        var act = async () => await BuildClient().LoginAsync("a@b.io", "wrong", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidCredentialsException>();
    }

    [Fact]
    public async Task LoginAsync_maps_5xx_to_AuthTransportException()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/login").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(502));
        var act = async () => await BuildClient().LoginAsync("a@b.io", "p", CancellationToken.None);
        await act.Should().ThrowAsync<AuthTransportException>();
    }

    [Fact]
    public async Task LoginAsync_succeeds_on_200()
    {
        var expiresAt = DateTime.UtcNow.AddDays(1);
        _server.Given(Request.Create().WithPath("/v1/auth/login").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody($$"""{"userId":"u2","token":"t2","expiresAt":"{{expiresAt:O}}"}"""));
        var result = await BuildClient().LoginAsync("a@b.io", "Hunter2longenough!", CancellationToken.None);
        result.UserId.Should().Be("u2");
    }

    [Fact]
    public async Task LogoutAsync_succeeds_on_204_and_on_401()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/logout").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(204));
        await BuildClient().LogoutAsync("t", CancellationToken.None);

        _server.Reset();
        _server.Given(Request.Create().WithPath("/v1/auth/logout").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(401));
        await BuildClient().LogoutAsync("t", CancellationToken.None);
    }

    [Fact]
    public async Task LogoutAsync_maps_5xx_to_AuthTransportException()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/logout").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(500));
        var act = async () => await BuildClient().LogoutAsync("t", CancellationToken.None);
        await act.Should().ThrowAsync<AuthTransportException>();
    }

    [Fact]
    public async Task GetCurrentUserAsync_returns_null_on_401()
    {
        _server.Given(Request.Create().WithPath("/v1/me").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(401));
        var result = await BuildClient().GetCurrentUserAsync("t", CancellationToken.None);
        result.Should().BeNull();
    }

    [Fact]
    public async Task GetCurrentUserAsync_returns_user_on_200()
    {
        _server.Given(Request.Create().WithPath("/v1/me").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("""{"userId":"u1","email":"a@b.io"}"""));
        var result = await BuildClient().GetCurrentUserAsync("t", CancellationToken.None);
        result!.UserId.Should().Be("u1");
        result.Email.Should().Be("a@b.io");
    }

    [Fact]
    public async Task GetCurrentUserAsync_maps_5xx_to_AuthTransportException()
    {
        _server.Given(Request.Create().WithPath("/v1/me").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(503));
        var act = async () => await BuildClient().GetCurrentUserAsync("t", CancellationToken.None);
        await act.Should().ThrowAsync<AuthTransportException>();
    }

    [Fact]
    public async Task RegisterAsync_throws_on_empty_body()
    {
        _server.Given(Request.Create().WithPath("/v1/auth/register").UsingPost())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Length", "0"));
        var act = async () => await BuildClient().RegisterAsync("a", "b", CancellationToken.None);
        await act.Should().ThrowAsync<AuthTransportException>();
    }
}
