import { describe, expect, it } from "vitest";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";

describe("GET / (browse UI)", () => {
  it("serves a self-contained HTML page wired to the read APIs", async () => {
    const res = await call("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Reyn Knowledge Base");
    // The page must drive itself off the open read endpoints.
    for (const endpoint of [
      "/v1/kb/stats",
      "/v1/kb/verify",
      "/v1/kb/sources",
      "/v1/kb/pages",
      "/chunks",
      "/v1/kb/search",
    ]) {
      expect(html).toContain(endpoint);
    }
    // Pagination: a "Load more" button that follows the cursor to reach the full corpus.
    for (const marker of ["Load more", "nextCursor", "&cursor="]) {
      expect(html).toContain(marker);
    }
  });
});
