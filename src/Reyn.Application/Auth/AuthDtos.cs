namespace Reyn.Application.Auth;

/// <summary>
/// What the desktop sends to <c>/v1/auth/register</c> and <c>/v1/auth/login</c>.
/// </summary>
public sealed record AuthRequest(string Email, string Password);

/// <summary>
/// Successful auth result. <see cref="ExpiresAt"/> is the absolute UTC
/// timestamp; the desktop uses it to short-circuit pre-emptive refresh.
/// </summary>
public sealed record AuthResult(string UserId, string Token, DateTime ExpiresAt);

/// <summary>
/// Currently-active session details, returned by <c>/v1/me</c>.
/// </summary>
public sealed record CurrentUser(string UserId, string Email);

/// <summary>
/// Persisted shape of the DPAPI-encrypted blob on disk. Includes
/// <see cref="ExpiresAt"/> so we can drop the token without a network hit
/// when it has already expired.
/// </summary>
public sealed record StoredAuth(string UserId, string Token, DateTime ExpiresAt);
