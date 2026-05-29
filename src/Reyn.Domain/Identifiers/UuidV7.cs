using System.Security.Cryptography;

namespace Reyn.Domain.Identifiers;

/// <summary>
/// UUIDv7 generator per RFC 9562. Time-ordered identifiers whose string
/// representation sorts by creation instant — see ADR-0007.
/// </summary>
public static class UuidV7
{
    /// <summary>
    /// Generates a new UUIDv7. The first 48 bits encode the current Unix
    /// millisecond timestamp; the remaining 74 bits are cryptographically
    /// random (after the 4-bit version field and 2-bit variant field).
    /// </summary>
    public static Guid NewGuid()
    {
        Span<byte> bytes = stackalloc byte[16];
        var unixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        bytes[0] = (byte)((unixMs >> 40) & 0xFF);
        bytes[1] = (byte)((unixMs >> 32) & 0xFF);
        bytes[2] = (byte)((unixMs >> 24) & 0xFF);
        bytes[3] = (byte)((unixMs >> 16) & 0xFF);
        bytes[4] = (byte)((unixMs >> 8) & 0xFF);
        bytes[5] = (byte)(unixMs & 0xFF);

        RandomNumberGenerator.Fill(bytes[6..]);

        // Stamp version 7 in the high nibble of byte 6.
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x70);
        // Stamp variant 10xx in the high two bits of byte 8.
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80);

        return new Guid(bytes, bigEndian: true);
    }
}
