import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "../../src/lib/token.ts";

describe("token", () => {
  it("generateToken produces a base64url string of meaningful length", () => {
    const a = generateToken();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });

  it("generateToken returns distinct tokens", () => {
    const set = new Set<string>();
    for (let i = 0; i < 20; i++) set.add(generateToken());
    expect(set.size).toBe(20);
  });

  it("hashToken is deterministic for a given pepper+token", async () => {
    const pepper = "pepper-x";
    const t = "token-abc";
    const a = await hashToken(t, pepper);
    const b = await hashToken(t, pepper);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashToken changes when the pepper changes", async () => {
    const t = "token-abc";
    const a = await hashToken(t, "pepper-1");
    const b = await hashToken(t, "pepper-2");
    expect(a).not.toBe(b);
  });

  it("hashToken throws when the pepper is empty", async () => {
    await expect(hashToken("t", "")).rejects.toThrow(/SESSION_PEPPER/);
  });
});
