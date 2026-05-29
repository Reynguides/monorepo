using Reyn.Application.Auth;

namespace Reyn.Desktop.ViewModels.Tests.Stubs;

public sealed class InMemoryTokenStore : IAuthTokenStore
{
    public StoredAuth? Current { get; private set; }

    public Task SaveAsync(StoredAuth auth, CancellationToken ct)
    {
        Current = auth;
        return Task.CompletedTask;
    }

    public Task<StoredAuth?> LoadAsync(CancellationToken ct) => Task.FromResult(Current);

    public Task ClearAsync(CancellationToken ct)
    {
        Current = null;
        return Task.CompletedTask;
    }
}
