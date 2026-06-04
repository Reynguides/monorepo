import { describe, expect, it } from "vitest";
import { parseRuleParams } from "../src/rules/params.ts";
import { RuleConfigError } from "../src/rules/types.ts";

describe("parseRuleParams", () => {
  it("applies canonical_url defaults", () => {
    expect(parseRuleParams("canonical_url", {})).toEqual({
      stripParams: [],
      lowercaseHost: true,
      dropFragment: true,
    });
  });

  it("applies the derive_summary default when params are undefined", () => {
    expect(parseRuleParams("derive_summary", undefined)).toEqual({ maxChars: 280 });
  });

  it("accepts valid min_text_len + allowed_page_type", () => {
    expect(parseRuleParams("min_text_len", { min: 10 })).toEqual({ min: 10 });
    expect(parseRuleParams("allowed_page_type", { allowed: ["spell"] })).toEqual({
      allowed: ["spell"],
    });
  });

  it("throws RuleConfigError for an unknown kind", () => {
    expect(() => parseRuleParams("bogus", {})).toThrow(RuleConfigError);
  });

  it("throws RuleConfigError with issues for invalid params", () => {
    let caught: unknown;
    try {
      parseRuleParams("min_text_len", { min: -1 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(RuleConfigError);
    expect((caught as RuleConfigError).issues).toBeDefined();
  });

  it("rejects allowed_page_type with an empty allow-list", () => {
    expect(() => parseRuleParams("allowed_page_type", { allowed: [] })).toThrow(RuleConfigError);
  });
});
