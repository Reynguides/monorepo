using System.IO;
using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using Reyn.Application.Auth;
using Reyn.Application.Sync;

namespace Reyn.Infrastructure.Auth;

[SupportedOSPlatform("windows")]

/// <summary>
/// Persists the session blob at <c>%LocalAppData%\Reyn\auth.bin</c> via
/// Windows DPAPI (<see cref="ProtectedData"/>, CurrentUser scope). Implements
/// both <see cref="IAuthTokenStore"/> (write side from the auth flow) and
/// <see cref="IAuthTokenSource"/> (read side from the outbox processor).
///
/// In-memory cache mirrors the disk state so the outbox doesn't pay a disk
/// hit per cycle. A <see cref="SemaphoreSlim"/> guards concurrent
/// load/save races between the splash session check and the auth flow.
/// </summary>
public sealed class DpapiTokenStore : IAuthTokenStore, IAuthTokenSource, IDisposable
{
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("Reyn.DpapiTokenStore.v1");

    private readonly string _path;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private StoredAuth? _cached;
    private bool _loaded;

    public DpapiTokenStore() : this(DefaultPath())
    {
    }

    /// <summary>Test seam: lets unit tests redirect the file location.</summary>
    public DpapiTokenStore(string path)
    {
        _path = path;
    }

    public async Task SaveAsync(StoredAuth auth, CancellationToken ct)
    {
        await _lock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            var directory = Path.GetDirectoryName(_path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }
            var plaintext = JsonSerializer.SerializeToUtf8Bytes(auth);
            var encrypted = ProtectedData.Protect(plaintext, Entropy, DataProtectionScope.CurrentUser);
            await File.WriteAllBytesAsync(_path, encrypted, ct).ConfigureAwait(false);
            _cached = auth;
            _loaded = true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<StoredAuth?> LoadAsync(CancellationToken ct)
    {
        await _lock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (_loaded)
            {
                return _cached;
            }
            if (!File.Exists(_path))
            {
                _loaded = true;
                _cached = null;
                return null;
            }
            var encrypted = await File.ReadAllBytesAsync(_path, ct).ConfigureAwait(false);
            var plaintext = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser);
            var stored = JsonSerializer.Deserialize<StoredAuth>(plaintext);
            _cached = stored;
            _loaded = true;
            return stored;
        }
        catch (CryptographicException)
        {
            _cached = null;
            _loaded = true;
            return null;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task ClearAsync(CancellationToken ct)
    {
        await _lock.WaitAsync(ct).ConfigureAwait(false);
        try
        {
            if (File.Exists(_path))
            {
                File.Delete(_path);
            }
            _cached = null;
            _loaded = true;
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<string?> GetTokenAsync(CancellationToken ct)
    {
        var stored = await LoadAsync(ct).ConfigureAwait(false);
        if (stored is null || stored.ExpiresAt <= DateTime.UtcNow)
        {
            return null;
        }
        return stored.Token;
    }

    public void Dispose() => _lock.Dispose();

    /// <summary>
    /// <c>%LocalAppData%\Reyn\auth.bin</c>. Public for the App to log/show
    /// in diagnostic UI.
    /// </summary>
    public static string DefaultPath() => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "Reyn",
        "auth.bin");
}
