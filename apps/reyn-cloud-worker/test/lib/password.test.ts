import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../src/lib/password.ts";

describe("password (PBKDF2-SHA-256)", () => {
  it("hash is not the plaintext, and uses the pbkdf2 prefix", async () => {
    const hash = await hashPassword("Hunter2longenough!");
    expect(hash).not.toBe("Hunter2longenough!");
    expect(hash.startsWith("pbkdf2-sha256$")).toBe(true);
  });

  it("verify accepts the correct password", async () => {
    const hash = await hashPassword("p@ssword-long-1");
    await expect(verifyPassword("p@ssword-long-1", hash)).resolves.toBe(true);
  });

  it("verify rejects the wrong password", async () => {
    const hash = await hashPassword("p@ssword-long-1");
    await expect(verifyPassword("p@ssword-long-2", hash)).resolves.toBe(false);
  });

  it("two hashes of the same password differ (salted)", async () => {
    const a = await hashPassword("same-pw-1234567890");
    const b = await hashPassword("same-pw-1234567890");
    expect(a).not.toBe(b);
  });

  it("verify returns false on malformed encoded hashes", async () => {
    await expect(verifyPassword("anything", "not-a-real-string")).resolves.toBe(false);
    await expect(verifyPassword("anything", "wrong-scheme$i=1$s$h")).resolves.toBe(false);
    await expect(verifyPassword("anything", "pbkdf2-sha256$notiter$s$h")).resolves.toBe(false);
    await expect(verifyPassword("anything", "pbkdf2-sha256$i=abc$s$h")).resolves.toBe(false);
    await expect(verifyPassword("anything", "pbkdf2-sha256$i=0$s$h")).resolves.toBe(false);
    // i= with empty digits parses as NaN.
    await expect(verifyPassword("anything", "pbkdf2-sha256$i=$s$h")).resolves.toBe(false);
  });

  it("verify returns false when the stored hash length doesn't match a fresh derivation", async () => {
    // Hash decodes to 1 byte; PBKDF2 derives 32 bytes; constantTimeEqual
    // hits the length-mismatch branch.
    const truncated = "pbkdf2-sha256$i=100000$AAAAAAAAAAAAAAAAAAAAAA$AA";
    await expect(verifyPassword("anything", truncated)).resolves.toBe(false);
  });
});
