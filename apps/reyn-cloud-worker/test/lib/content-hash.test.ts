import { describe, expect, it } from "vitest";
import { computeContentHash } from "../../src/lib/content-hash.ts";

describe("computeContentHash", () => {
  it("produces a 64-char hex digest", async () => {
    const h = await computeContentHash("u1", "bg3.x", 123, "{}");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for identical inputs", async () => {
    const a = await computeContentHash("u1", "bg3.x", 123, "{}");
    const b = await computeContentHash("u1", "bg3.x", 123, "{}");
    expect(a).toBe(b);
  });

  it("differs when user_id differs", async () => {
    const a = await computeContentHash("u1", "bg3.x", 123, "{}");
    const b = await computeContentHash("u2", "bg3.x", 123, "{}");
    expect(a).not.toBe(b);
  });

  it("differs when payload differs", async () => {
    const a = await computeContentHash("u", "bg3.x", 1, '{"k":1}');
    const b = await computeContentHash("u", "bg3.x", 1, '{"k":2}');
    expect(a).not.toBe(b);
  });
});
