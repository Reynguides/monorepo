import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";

describe("kb-d1 migration", () => {
  it("creates the expected tables", async () => {
    const rows = await env.KB_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    for (const t of ["sources", "pages", "images", "chunks", "crawl_state", "embedding_state"]) {
      expect(names).toContain(t);
    }
  });

  it("supports insert + select on pages", async () => {
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-1", "BG3 Wiki", "https://bg3.wiki", 1, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, title, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("page-1", "src-1", "https://bg3.wiki/Astarion", "Astarion", "hash-1", now, now)
      .run();

    const row = await env.KB_DB.prepare("SELECT title, content_hash FROM pages WHERE id = ?")
      .bind("page-1")
      .first<{ title: string; content_hash: string }>();
    expect(row).not.toBeNull();
    expect(row!.title).toBe("Astarion");
    expect(row!.content_hash).toBe("hash-1");
  });

  it("enforces the UNIQUE(source_id, url) index on pages", async () => {
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-dup", "Dup Source", "https://dup.example", 2, now)
      .run();
    const insertPage = (id: string) =>
      env.KB_DB.prepare(
        "INSERT INTO pages (id, source_id, url, title, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(id, "src-dup", "https://dup.example/page", "P", "h", now, now)
        .run();

    await insertPage("p-a");
    await expect(insertPage("p-b")).rejects.toThrow();
  });
});
