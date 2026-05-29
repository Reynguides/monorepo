namespace Reyn.Application.Sync;

/// <summary>
/// Base class for sync transport errors. The outbox processor switches on
/// these subtypes to decide retry vs. dead-letter.
/// </summary>
public abstract class SyncException : Exception
{
    protected SyncException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>5xx, network timeout, DNS failure — try again later.</summary>
public sealed class SyncTransientException(string message, Exception? inner = null)
    : SyncException(message, inner);

/// <summary>401 / 403 — the token needs refresh; bubble up so the auth layer can react.</summary>
public sealed class SyncAuthException(string message, Exception? inner = null)
    : SyncException(message, inner);

/// <summary>
/// 4xx (other than 401/403). Bug in the client or rejected payload.
/// Dead-letter immediately; retrying won't help.
/// </summary>
public sealed class SyncPermanentException(string message, Exception? inner = null)
    : SyncException(message, inner);
