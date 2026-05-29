namespace Reyn.Application.Auth;

/// <summary>
/// Base class for auth-flow errors that bubble up to ViewModels for UI display.
/// Subclasses partition by recovery strategy: bad creds = retry, network =
/// retry-with-banner, validation = field-level message.
/// </summary>
public abstract class AuthException : Exception
{
    protected AuthException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>HTTP 401 — wrong email or password. UI message: "Invalid credentials."</summary>
public sealed class InvalidCredentialsException(string message = "Invalid credentials.")
    : AuthException(message);

/// <summary>HTTP 409 — register collision on email. UI message: "That email is already in use."</summary>
public sealed class EmailAlreadyExistsException(string message = "That email is already in use.")
    : AuthException(message);

/// <summary>HTTP 400 — Zod validation failed. The server's issues array is attached for advanced UIs.</summary>
public sealed class AuthValidationException(string message, object? issues = null)
    : AuthException(message)
{
    public object? Issues { get; } = issues;
}

/// <summary>HTTP 5xx / network failure. Inline banner: "Network problem. Try again."</summary>
public sealed class AuthTransportException(string message, Exception? inner = null)
    : AuthException(message, inner);
