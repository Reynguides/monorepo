using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Reyn.Application.Auth;
using Reyn.Application.Sync;

namespace Reyn.Infrastructure.Http;

/// <summary>
/// HttpClient-based <see cref="IAuthClient"/>. Mirrors the structure of
/// <see cref="HttpEventSyncClient"/>: a typed HttpClient registered via
/// IHttpClientFactory, status→exception mapping at the boundary.
/// </summary>
public sealed partial class HttpAuthClient(
    HttpClient http,
    ILogger<HttpAuthClient> log,
    IOptions<SyncOptions> options) : IAuthClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Uri _baseAddress = options.Value.WorkerBaseAddress;

    public Task<AuthResult> RegisterAsync(string email, string password, CancellationToken ct) =>
        PostCredentialsAsync("/v1/auth/register", email, password, ct);

    public Task<AuthResult> LoginAsync(string email, string password, CancellationToken ct) =>
        PostCredentialsAsync("/v1/auth/login", email, password, ct);

    public async Task LogoutAsync(string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(_baseAddress, "/v1/auth/logout"));
        request.Headers.Authorization = new("Bearer", token);
        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        if (response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.Unauthorized)
        {
            return;
        }
        await ThrowMappedAsync(response, ct).ConfigureAwait(false);
    }

    public async Task<CurrentUser?> GetCurrentUserAsync(string token, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseAddress, "/v1/me"));
        request.Headers.Authorization = new("Bearer", token);
        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            return null;
        }
        if (!response.IsSuccessStatusCode)
        {
            await ThrowMappedAsync(response, ct).ConfigureAwait(false);
        }
        return await DeserializeOrThrowAsync<CurrentUser>(response, ct).ConfigureAwait(false);
    }

    private async Task<AuthResult> PostCredentialsAsync(string path, string email, string password, CancellationToken ct)
    {
        using var response = await http.PostAsJsonAsync(
            new Uri(_baseAddress, path),
            new AuthRequest(email, password),
            JsonOptions,
            ct).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            await ThrowMappedAsync(response, ct).ConfigureAwait(false);
        }
        var body = await DeserializeOrThrowAsync<AuthResponseBody>(response, ct).ConfigureAwait(false);
        var expires = DateTime.Parse(body.ExpiresAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind);
        return new AuthResult(body.UserId, body.Token, expires);
    }

    private async Task ThrowMappedAsync(HttpResponseMessage response, CancellationToken ct)
    {
        var status = (int)response.StatusCode;
        var text = await SafeReadAsync(response, ct).ConfigureAwait(false);
        Log.AuthFailed(log, status, text);

        switch (response.StatusCode)
        {
            case HttpStatusCode.Unauthorized:
            case HttpStatusCode.Forbidden:
                throw new InvalidCredentialsException();
            case HttpStatusCode.Conflict:
                throw new EmailAlreadyExistsException();
            case HttpStatusCode.BadRequest:
                throw new AuthValidationException(text);
        }
        if (status >= 500)
        {
            throw new AuthTransportException($"Server error: HTTP {status}");
        }
        throw new AuthTransportException($"HTTP {status} {text}");
    }

    private static async Task<T> DeserializeOrThrowAsync<T>(HttpResponseMessage response, CancellationToken ct)
        where T : class
    {
        try
        {
            var body = await response.Content.ReadFromJsonAsync<T>(JsonOptions, ct).ConfigureAwait(false);
            return body ?? throw new AuthTransportException("Empty response body");
        }
        catch (JsonException ex)
        {
            throw new AuthTransportException("Failed to parse response body", ex);
        }
    }

    private static async Task<string> SafeReadAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            return await response.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        }
        catch (HttpRequestException)
        {
            return string.Empty;
        }
    }

    private sealed record AuthResponseBody(string UserId, string Token, string ExpiresAt);

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Warning, Message = "Auth request failed: HTTP {Status} body={Body}")]
        public static partial void AuthFailed(ILogger logger, int status, string body);
    }
}
