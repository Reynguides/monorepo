using Reyn.Application.Auth;

namespace Reyn.Desktop.ViewModels.Tests.Stubs;

/// <summary>
/// Records calls + replays scripted responses. Each method has both a "next
/// throw" slot and a "next result" slot — the throw wins if set.
/// </summary>
public sealed class StubAuthClient : IAuthClient
{
    public AuthException? NextLoginThrow { get; set; }
    public AuthException? NextRegisterThrow { get; set; }
    public AuthResult NextLoginResult { get; set; } = new("u1", "tok-login", DateTime.UtcNow.AddHours(1));
    public AuthResult NextRegisterResult { get; set; } = new("u1", "tok-register", DateTime.UtcNow.AddHours(1));

    public TimeSpan ArtificialDelay { get; set; }

    public int LoginCalls { get; private set; }
    public int RegisterCalls { get; private set; }
    public string? LastEmail { get; private set; }

    public async Task<AuthResult> LoginAsync(string email, string password, CancellationToken ct)
    {
        LoginCalls++;
        LastEmail = email;
        if (ArtificialDelay > TimeSpan.Zero)
        {
            await Task.Delay(ArtificialDelay, ct).ConfigureAwait(false);
        }
        if (NextLoginThrow is { } ex)
        {
            throw ex;
        }
        return NextLoginResult;
    }

    public async Task<AuthResult> RegisterAsync(string email, string password, CancellationToken ct)
    {
        RegisterCalls++;
        LastEmail = email;
        if (ArtificialDelay > TimeSpan.Zero)
        {
            await Task.Delay(ArtificialDelay, ct).ConfigureAwait(false);
        }
        if (NextRegisterThrow is { } ex)
        {
            throw ex;
        }
        return NextRegisterResult;
    }

    public Task LogoutAsync(string token, CancellationToken ct) => Task.CompletedTask;

    public Task<CurrentUser?> GetCurrentUserAsync(string token, CancellationToken ct) =>
        Task.FromResult<CurrentUser?>(new CurrentUser("u1", "u1@example.com"));
}
