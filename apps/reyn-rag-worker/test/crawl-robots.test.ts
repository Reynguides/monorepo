import { describe, expect, it } from "vitest";
import { parseRobots } from "../src/crawl/robots.ts";

describe("parseRobots", () => {
  it("allows everything when there are no rules / no matching group", () => {
    const r = parseRobots("", "ReynBot");
    expect(r.isAllowed("/anything")).toBe(true);
    expect(r.crawlDelayMs).toBe(0);
  });

  it("disallows a path prefix under the wildcard group", () => {
    const text = `User-agent: *
Disallow: /private`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/private/page")).toBe(false);
    expect(r.isAllowed("/public/page")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    const text = `User-agent: *
Disallow:`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/anything")).toBe(true);
  });

  it("longest-match wins: a more specific Allow overrides a broader Disallow", () => {
    const text = `User-agent: *
Disallow: /wiki/
Allow: /wiki/Special:Public`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/wiki/Hidden")).toBe(false);
    expect(r.isAllowed("/wiki/Special:Public/Page")).toBe(true);
  });

  it("on an equal-length tie, Allow wins", () => {
    const text = `User-agent: *
Disallow: /x
Allow: /x`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/x/page")).toBe(true);
  });

  it("prefers the UA-specific group over the wildcard group", () => {
    const text = `User-agent: *
Disallow: /

User-agent: ReynBot
Disallow: /admin`;
    const r = parseRobots(text, "ReynBot");
    // The specific group only blocks /admin — root is allowed for ReynBot.
    expect(r.isAllowed("/page")).toBe(true);
    expect(r.isAllowed("/admin/x")).toBe(false);
  });

  it("falls back to the wildcard group for a non-listed UA", () => {
    const text = `User-agent: GoogleBot
Disallow: /nogoogle

User-agent: *
Disallow: /shared`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/shared/x")).toBe(false);
    expect(r.isAllowed("/nogoogle/x")).toBe(true); // GoogleBot rule doesn't apply.
  });

  it("matches the UA case-insensitively", () => {
    const text = `User-agent: reynbot
Disallow: /secret`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/secret/x")).toBe(false);
  });

  it("shares one rule block across consecutive User-agent lines", () => {
    const text = `User-agent: A
User-agent: ReynBot
Disallow: /both`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/both/x")).toBe(false);
  });

  it("parses Crawl-delay seconds into ms", () => {
    const text = `User-agent: *
Crawl-delay: 2`;
    expect(parseRobots(text, "ReynBot").crawlDelayMs).toBe(2000);
  });

  it("parses a fractional Crawl-delay and ignores a non-numeric one", () => {
    expect(parseRobots(`User-agent: *\nCrawl-delay: 0.5`, "ReynBot").crawlDelayMs).toBe(500);
    expect(parseRobots(`User-agent: *\nCrawl-delay: soon`, "ReynBot").crawlDelayMs).toBe(0);
    expect(parseRobots(`User-agent: *\nCrawl-delay: -3`, "ReynBot").crawlDelayMs).toBe(0);
  });

  it("ignores comments, blank lines, and directives before any User-agent", () => {
    const text = `# a comment
Disallow: /orphan

User-agent: *  # trailing comment
Disallow: /blocked # inline`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/orphan/x")).toBe(true); // orphan directive ignored
    expect(r.isAllowed("/blocked/x")).toBe(false);
  });

  it("ignores unparseable lines with no colon", () => {
    const text = `User-agent: *
this line has no colon
Disallow: /z`;
    const r = parseRobots(text, "ReynBot");
    expect(r.isAllowed("/z/x")).toBe(false);
  });
});
