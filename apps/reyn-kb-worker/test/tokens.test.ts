import { describe, expect, it } from "vitest";
import { approxTokenCount } from "../src/lib/tokens.ts";

describe("approxTokenCount", () => {
  it("estimates chars/4 rounded up", () => {
    expect(approxTokenCount("")).toBe(0);
    expect(approxTokenCount("abcd")).toBe(1);
    expect(approxTokenCount("abcde")).toBe(2);
  });
});
