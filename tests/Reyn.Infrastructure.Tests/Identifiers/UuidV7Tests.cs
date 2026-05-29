using FluentAssertions;
using Reyn.Domain.Identifiers;
using Xunit;

namespace Reyn.Infrastructure.Tests.Identifiers;

public sealed class UuidV7Tests
{
    [Fact]
    public void NewGuid_stamps_version_seven_in_the_correct_nibble()
    {
        var guid = UuidV7.NewGuid();

        var bytes = guid.ToByteArray(bigEndian: true);

        // Version is the high nibble of byte 6.
        (bytes[6] >> 4).Should().Be(0x7);
        // Variant is the high two bits of byte 8 — RFC 4122 family: 10xx.
        (bytes[8] >> 6).Should().Be(0b10);
    }

    [Fact]
    public void NewGuid_returns_time_ordered_identifiers()
    {
        var earlier = UuidV7.NewGuid();
        Thread.Sleep(5);
        var later = UuidV7.NewGuid();

        // Big-endian byte comparison sorts UUIDv7 chronologically.
        var earlierBytes = earlier.ToByteArray(bigEndian: true);
        var laterBytes = later.ToByteArray(bigEndian: true);

        Compare(earlierBytes, laterBytes).Should().BeLessThan(0,
            because: "UUIDv7 generated later should sort after one generated earlier");
    }

    private static int Compare(byte[] a, byte[] b)
    {
        for (var i = 0; i < a.Length; i++)
        {
            var diff = a[i].CompareTo(b[i]);
            if (diff != 0)
            {
                return diff;
            }
        }
        return 0;
    }
}
