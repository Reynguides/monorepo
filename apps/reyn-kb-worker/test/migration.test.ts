import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";

describe("kb-d1 migration", () => {
  it("creates the expected tables", async () => {
    const rows = await env.KB_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    for (const t of [
      "sources",
      "pages",
      "sections",
      "page_edges",
      "entities",
      "rules",
      "rule_events",
      "chunks",
      "images",
      "chunk_images",
      "embedding_state",
      "chunks_fts",
    ]) {
      expect(names).toContain(t);
    }
  });

  it("applies structured-field defaults on pages", async () => {
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-1", "BG3 Wiki", "https://bg3.wiki", 1, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, title, page_type, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("page-1", "src-1", "https://bg3.wiki/Fireball", "Fireball", "spell", "hash-1", now, now)
      .run();

    const row = await env.KB_DB.prepare(
      "SELECT title, page_type, tags, language, lifecycle, version FROM pages WHERE id = ?",
    )
      .bind("page-1")
      .first<{
        title: string;
        page_type: string;
        tags: string;
        language: string;
        lifecycle: string;
        version: number;
      }>();
    expect(row).not.toBeNull();
    expect(row!.title).toBe("Fireball");
    expect(row!.page_type).toBe("spell");
    expect(row!.tags).toBe("[]");
    expect(row!.language).toBe("en");
    expect(row!.lifecycle).toBe("active");
    expect(row!.version).toBe(1);
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
        "INSERT INTO pages (id, source_id, url, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(id, "src-dup", "https://dup.example/page", "h", now, now)
        .run();

    await insertPage("p-a");
    await expect(insertPage("p-b")).rejects.toThrow();
  });
});
