import { describe, expect, it, vi } from "vitest";
import { formatLogLine, logEvent } from "../src/lib/log.ts";

describe("formatLogLine", () => {
  it("serializes level + event + flat fields to one JSON line", () => {
    const line = formatLogLine("info", "kb.index", { pageId: "p1", chunks: 3, reindexed: false });
    expect(JSON.parse(line)).toEqual({
      level: "info",
      event: "kb.index",
      pageId: "p1",
      chunks: 3,
      reindexed: false,
    });
    expect(line).not.toContain("\n");
  });
});

describe("logEvent", () => {
  it("emits the formatted line via console.log, defaulting fields to {}", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logEvent("warn", "kb.test", { n: 1 });
    expect(spy).toHaveBeenCalledWith(formatLogLine("warn", "kb.test", { n: 1 }));
    logEvent("info", "kb.empty");
    expect(spy).toHaveBeenLastCalledWith('{"level":"info","event":"kb.empty"}');
    spy.mockRestore();
  });
});
