import { describe, expect, it } from "vitest";
import { bytesToBase64Url, bytesToHex } from "../../src/lib/hex.ts";

describe("hex helpers", () => {
  it("bytesToHex emits zero-padded lowercase hex", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  });

  it("bytesToBase64Url strips padding and uses url-safe alphabet", () => {
    // "??>" maps to bytes 0x3f 0x3f 0x3e — base64 would have `+` and `/`.
    const out = bytesToBase64Url(new Uint8Array([0x3f, 0xbf, 0xfe]));
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.includes("=")).toBe(false);
  });
});
