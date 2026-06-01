using System.Runtime.Versioning;
using FluentAssertions;
using Reyn.Application.Auth;
using Reyn.Infrastructure.Auth;
using Xunit;

namespace Reyn.Application.Tests.Auth;

/// <summary>
/// DPAPI is Windows-only; these tests can only meaningfully run on a
/// Windows CI runner. The class is annotated <c>[SupportedOSPlatform("windows")]</c>
/// so non-Windows builds don't reference it.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class DpapiTokenStoreTests : IDisposable
{
    private readonly string _path;

    public DpapiTokenStoreTests()
    {
        _path = Path.Combine(Path.GetTempPath(), $"reyn-dpapi-test-{Guid.NewGuid():N}.bin");
    }

    public void Dispose()
    {
        if (File.Exists(_path))
        {
            File.Delete(_path);
        }
    }

    [Fact]
    public async Task LoadAsync_returns_null_when_file_missing()
    {
        using var store = new DpapiTokenStore(_path);
        (await store.LoadAsync(CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task SaveAsync_then_LoadAsync_round_trips_the_blob()
    {
        using var store = new DpapiTokenStore(_path);
        var auth = new StoredAuth("u1", "tok", DateTime.UtcNow.AddHours(1));
        await store.SaveAsync(auth, CancellationToken.None);
        File.Exists(_path).Should().BeTrue();

        // New instance to skip the in-memory cache.
        using var freshStore = new DpapiTokenStore(_path);
        var loaded = await freshStore.LoadAsync(CancellationToken.None);
        loaded.Should().Be(auth);
    }

    [Fact]
    public async Task ClearAsync_removes_the_file()
    {
        using var store = new DpapiTokenStore(_path);
        await store.SaveAsync(new StoredAuth("u", "t", DateTime.UtcNow.AddHours(1)), CancellationToken.None);
        await store.ClearAsync(CancellationToken.None);
        File.Exists(_path).Should().BeFalse();
        (await store.LoadAsync(CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task GetTokenAsync_returns_null_when_token_is_expired()
    {
        using var store = new DpapiTokenStore(_path);
        await store.SaveAsync(new StoredAuth("u", "stale", DateTime.UtcNow.AddMinutes(-1)), CancellationToken.None);
        var token = await store.GetTokenAsync(CancellationToken.None);
        token.Should().BeNull();
    }

    [Fact]
    public async Task GetTokenAsync_returns_token_when_live()
    {
        using var store = new DpapiTokenStore(_path);
        await store.SaveAsync(new StoredAuth("u", "live", DateTime.UtcNow.AddHours(1)), CancellationToken.None);
        var token = await store.GetTokenAsync(CancellationToken.None);
        token.Should().Be("live");
    }

    [Fact]
    public async Task LoadAsync_returns_null_when_file_is_corrupted()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        await File.WriteAllBytesAsync(_path, [0xFF, 0xFE, 0xFD]); // not a DPAPI blob
        using var store = new DpapiTokenStore(_path);
        (await store.LoadAsync(CancellationToken.None)).Should().BeNull();
    }

    [Fact]
    public async Task SaveAsync_replaces_prior_value()
    {
        using var store = new DpapiTokenStore(_path);
        await store.SaveAsync(new StoredAuth("u", "first", DateTime.UtcNow.AddHours(1)), CancellationToken.None);
        await store.SaveAsync(new StoredAuth("u", "second", DateTime.UtcNow.AddHours(1)), CancellationToken.None);
        var loaded = await store.LoadAsync(CancellationToken.None);
        loaded!.Token.Should().Be("second");
    }

    [Fact]
    public void DefaultPath_uses_LocalAppData()
    {
        DpapiTokenStore.DefaultPath().Should().Contain("Reyn").And.EndWith("auth.bin");
    }

    [Fact]
    public async Task CurrentUserId_is_null_before_any_session_and_reflects_the_saved_user()
    {
        using var store = new DpapiTokenStore(_path);
        store.CurrentUserId.Should().BeNull();

        await store.SaveAsync(new StoredAuth("alice", "tok", DateTime.UtcNow.AddHours(1)), CancellationToken.None);
        store.CurrentUserId.Should().Be("alice");
    }
}
