import { describe, expect, it } from "vitest";
import { assembleContext, CONTEXT_SEPARATOR } from "../src/lib/context-assembly.ts";

describe("assembleContext", () => {
  it("returns empty context and 0 used for no chunks", () => {
    expect(assembleContext([], 1000)).toEqual({ context: "", usedChunks: 0 });
  });

  it("joins all chunks with the separator when they fit the budget", () => {
    const chunks = [{ text: "alpha" }, { text: "beta" }, { text: "gamma" }];
    const result = assembleContext(chunks, 1000);
    expect(result.usedChunks).toBe(3);
    expect(result.context).toBe(`alpha${CONTEXT_SEPARATOR}beta${CONTEXT_SEPARATOR}gamma`);
  });

  it("stops including chunks once the budget would be exceeded", () => {
    // alpha(5) + sep + beta(4) = exact total. A budget one char short of that
    // admits alpha but rejects beta (adding the separator + beta would exceed).
    const chunks = [{ text: "alpha" }, { text: "beta" }];
    const exactBoth = "alpha".length + CONTEXT_SEPARATOR.length + "beta".length;
    const result = assembleContext(chunks, exactBoth - 1);
    expect(result.usedChunks).toBe(1);
    expect(result.context).toBe("alpha");
  });

  it("includes the second chunk when the budget exactly fits both", () => {
    const chunks = [{ text: "alpha" }, { text: "beta" }];
    const exact = "alpha".length + CONTEXT_SEPARATOR.length + "beta".length;
    const result = assembleContext(chunks, exact);
    expect(result.usedChunks).toBe(2);
  });

  it("includes nothing when even the first chunk exceeds the budget", () => {
    const chunks = [{ text: "way too long" }];
    const result = assembleContext(chunks, 3);
    expect(result).toEqual({ context: "", usedChunks: 0 });
  });
});
