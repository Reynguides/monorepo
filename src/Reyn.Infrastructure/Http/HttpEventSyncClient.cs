using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Reyn.Application.Sync;

namespace Reyn.Infrastructure.Http;

/// <summary>
/// HttpClient-based implementation of <see cref="IEventSyncClient"/>. The
/// HttpClient itself is configured via <c>AddHttpClient&lt;HttpEventSyncClient&gt;</c>
/// in DI; this class only owns the wire-format and HTTP-status translation
/// into the <see cref="SyncException"/> taxonomy the outbox understands.
/// </summary>
public sealed partial class HttpEventSyncClient(
    HttpClient http,
    IAuthTokenSource tokens,
    ILogger<HttpEventSyncClient> log,
    IOptions<SyncOptions> options) : IEventSyncClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Uri _baseAddress = options.Value.WorkerBaseAddress;

    public async Task<PushResult> PushAsync(
        IReadOnlyList<EventPayload> events,
        string idempotencyKey,
        CancellationToken ct)
    {
        var token = await GetTokenOrThrowAsync(ct).ConfigureAwait(false);
        using var request = new HttpRequestMessage(HttpMethod.Post, new Uri(_baseAddress, "/v1/sync/push"))
        {
            Content = JsonContent.Create(new { events }, options: JsonOptions),
        };
        request.Headers.Authorization = new("Bearer", token);
        request.Headers.Add("Idempotency-Key", idempotencyKey);

        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        await ThrowIfFailureAsync(response, ct).ConfigureAwait(false);
        var body = await DeserializeOrThrowAsync<PushResponseBody>(response, ct).ConfigureAwait(false);
        return new PushResult(body.Accepted, body.Duplicates);
    }

    public async Task<PullPage> PullAsync(long? sinceCursor, int limit, CancellationToken ct)
    {
        var token = await GetTokenOrThrowAsync(ct).ConfigureAwait(false);
        var query = sinceCursor is null
            ? $"?limit={limit}"
            : $"?since={sinceCursor.Value}&limit={limit}";
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseAddress, "/v1/sync/pull" + query));
        request.Headers.Authorization = new("Bearer", token);

        using var response = await http.SendAsync(request, ct).ConfigureAwait(false);
        await ThrowIfFailureAsync(response, ct).ConfigureAwait(false);
        var body = await DeserializeOrThrowAsync<PullResponseBody>(response, ct).ConfigureAwait(false);
        var items = body.Items.Select(i => new PullItem(
            i.EventId, i.Type, i.OccurredAt, i.PayloadJson, i.ContentHash, i.ReceivedAt, i.Cursor)).ToList();
        return new PullPage(items, body.NextCursor);
    }

    private async Task<string> GetTokenOrThrowAsync(CancellationToken ct)
    {
        var t = await tokens.GetTokenAsync(ct).ConfigureAwait(false);
        if (string.IsNullOrEmpty(t))
        {
            throw new SyncAuthException("No bearer token available");
        }
        return t;
    }

    private async Task ThrowIfFailureAsync(HttpResponseMessage response, CancellationToken ct)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }
        var status = (int)response.StatusCode;
        var text = await SafeReadBodyAsync(response, ct).ConfigureAwait(false);
        Log.RequestFailed(log, status, text);

        if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
        {
            throw new SyncAuthException($"HTTP {status} {text}");
        }
        if (status >= 500)
        {
            throw new SyncTransientException($"HTTP {status} {text}");
        }
        throw new SyncPermanentException($"HTTP {status} {text}");
    }

    private static async Task<T> DeserializeOrThrowAsync<T>(HttpResponseMessage response, CancellationToken ct)
        where T : class
    {
        try
        {
            var body = await response.Content.ReadFromJsonAsync<T>(JsonOptions, ct).ConfigureAwait(false);
            return body ?? throw new SyncTransientException("Empty response body");
        }
        catch (JsonException ex)
        {
            throw new SyncTransientException("Failed to parse response body", ex);
        }
    }

    private static async Task<string> SafeReadBodyAsync(HttpResponseMessage response, CancellationToken ct)
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

    private sealed record PushResponseBody(int Accepted, int Duplicates);

    private sealed record PullItemBody(
        Guid EventId,
        string Type,
        long OccurredAt,
        string PayloadJson,
        string ContentHash,
        long ReceivedAt,
        long Cursor);

    private sealed record PullResponseBody(IReadOnlyList<PullItemBody> Items, long? NextCursor);

    private static partial class Log
    {
        [LoggerMessage(Level = LogLevel.Warning, Message = "Sync request failed: HTTP {Status} body={Body}")]
        public static partial void RequestFailed(ILogger logger, int status, string body);
    }
}
