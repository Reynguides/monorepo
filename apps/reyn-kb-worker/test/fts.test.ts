import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";

/** Seed a source + page so chunk inserts satisfy the (documented) FK shape. */
async function seedPage(): Promise<void> {
  const now = Date.now();
  await env.KB_DB.prepare(
    "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind("s", "S", "https://x", 1, now)
    .run();
  await env.KB_DB.prepare(
    "INSERT INTO pages (id, source_id, url, content_hash, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind("p", "s", "https://x/p", "h", now, now)
    .run();
}

describe("chunks_fts sync triggers", () => {
  it("indexes a chunk on insert and matches it with bm25 ranking", async () => {
    await seedPage();
    await env.KB_DB.prepare(
      "INSERT INTO chunks (id, page_id, ord, heading_path, text, content_hash, token_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("p:0", "p", 0, "Fireball", "Fireball deals fire damage in a 20-foot sphere", "c0", 12)
      .run();

    const hit = await env.KB_DB.prepare(
      "SELECT rowid, bm25(chunks_fts) AS score FROM chunks_fts WHERE chunks_fts MATCH ?",
    )
      .bind("fire")
      .all<{ rowid: number; score: number }>();
    expect(hit.results.length).toBe(1);
    expect(typeof hit.results[0]!.score).toBe("number");
  });

  it("removes the chunk from the index on delete", async () => {
    await seedPage();
    await env.KB_DB.prepare(
      "INSERT INTO chunks (id, page_id, ord, text, content_hash, token_count) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("p:0", "p", 0, "lightning bolt strikes a line", "c0", 6)
      .run();
    await env.KB_DB.prepare("DELETE FROM chunks WHERE id = ?").bind("p:0").run();

    const hit = await env.KB_DB.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?")
      .bind("lightning")
      .all<{ rowid: number }>();
    expect(hit.results.length).toBe(0);
  });

  it("re-indexes on update so stale terms stop matching", async () => {
    await seedPage();
    await env.KB_DB.prepare(
      "INSERT INTO chunks (id, page_id, ord, text, content_hash, token_count) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind("p:0", "p", 0, "acid splash", "c0", 2)
      .run();
    await env.KB_DB.prepare("UPDATE chunks SET text = ? WHERE id = ?")
      .bind("frost ray", "p:0")
      .run();

    const stale = await env.KB_DB.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?")
      .bind("acid")
      .all<{ rowid: number }>();
    const fresh = await env.KB_DB.prepare("SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?")
      .bind("frost")
      .all<{ rowid: number }>();
    expect(stale.results.length).toBe(0);
    expect(fresh.results.length).toBe(1);
  });
});
