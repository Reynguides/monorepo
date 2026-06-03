import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call } from "./helpers/client.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface SourceResult {
  sourceId: string;
}
interface PageResult {
  pageId: string;
  changed: boolean;
}
interface PageDetail {
  html: string | null;
  markdown: string | null;
}
interface ErrorBody {
  error: string;
}

async function createSource(name = "BG3 Wiki"): Promise<string> {
  const res = await call("/v1/kb/sources", {
    method: "POST",
    headers: AUTH,
    jsonBody: { name, baseUrl: "https://bg3.wiki", tier: 1 },
  });
  expect(res.status).toBe(201);
  const json: SourceResult = await res.json();
  return json.sourceId;
}

async function storePage(
  sourceId: string,
  url: string,
  html: string,
  title?: string,
): Promise<Response> {
  return call("/v1/kb/pages", {
    method: "POST",
    headers: AUTH,
    jsonBody: { sourceId, url, html, ...(title !== undefined ? { title } : {}) },
  });
}

async function contentHashOf(pageId: string): Promise<string> {
  const row = await env.KB_DB.prepare("SELECT content_hash FROM pages WHERE id = ?")
    .bind(pageId)
    .first<{ content_hash: string }>();
  return row!.content_hash;
}

describe("POST /v1/kb/sources", () => {
  it("inserts a source and returns sourceId 201", async () => {
    const sourceId = await createSource();
    const row = await env.KB_DB.prepare("SELECT name, tier FROM sources WHERE id = ?")
      .bind(sourceId)
      .first<{ name: string; tier: number }>();
    expect(row!.name).toBe("BG3 Wiki");
    expect(row!.tier).toBe(1);
  });

  it("rejects an invalid body with 400 validation_failed", async () => {
    const res = await call("/v1/kb/sources", {
      method: "POST",
      headers: AUTH,
      jsonBody: { name: "", baseUrl: "not-a-url", tier: 0 },
    });
    expect(res.status).toBe(400);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await call("/v1/kb/sources", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/kb/pages", () => {
  it("stores a new page (changed:true), persists the D1 row + R2 object", async () => {
    const sourceId = await createSource();
    const res = await storePage(
      sourceId,
      "https://bg3.wiki/Astarion",
      "<h1>Astarion</h1>",
      "Astarion",
    );
    expect(res.status).toBe(201);
    const json: PageResult = await res.json();
    expect(json.changed).toBe(true);

    const row = await env.KB_DB.prepare(
      "SELECT title, r2_raw_key, r2_md_key FROM pages WHERE id = ?",
    )
      .bind(json.pageId)
      .first<{ title: string; r2_raw_key: string; r2_md_key: string | null }>();
    expect(row!.title).toBe("Astarion");
    expect(row!.r2_raw_key).toBe(`pages/${json.pageId}/raw.html`);
    expect(row!.r2_md_key).toBeNull();

    const get = await call(`/v1/kb/pages/${json.pageId}`);
    expect(get.status).toBe(200);
    const detail: PageDetail = await get.json();
    expect(detail.html).toBe("<h1>Astarion</h1>");
    expect(detail.markdown).toBeNull();
  });

  it("is an idempotent no-op when re-storing identical html (changed:false, no R2 rewrite)", async () => {
    const sourceId = await createSource();
    const url = "https://bg3.wiki/Karlach";
    const first = await storePage(sourceId, url, "<p>Karlach</p>");
    const firstJson: PageResult = await first.json();
    const hashBefore = await contentHashOf(firstJson.pageId);

    // Capture the R2 upload marker after the first store (deterministic key).
    const key = `pages/${firstJson.pageId}/raw.html`;
    const headBefore = await env.KB_BUCKET.head(key);
    const uploadedBefore = headBefore!.uploaded.getTime();

    const second = await storePage(sourceId, url, "<p>Karlach</p>");
    expect(second.status).toBe(200);
    const secondJson: PageResult = await second.json();
    expect(secondJson.changed).toBe(false);
    expect(secondJson.pageId).toBe(firstJson.pageId);

    expect(await contentHashOf(firstJson.pageId)).toBe(hashBefore);

    // R2 blob was NOT rewritten on the idempotent re-store.
    const headAfter = await env.KB_BUCKET.head(key);
    expect(headAfter!.uploaded.getTime()).toBe(uploadedBefore);
  });

  it("supersedes in place when html changes (same pageId, new hash, R2 overwritten)", async () => {
    const sourceId = await createSource();
    const url = "https://bg3.wiki/Shadowheart";
    const first = await storePage(sourceId, url, "<p>v1</p>");
    const firstJson: PageResult = await first.json();
    const hashV1 = await contentHashOf(firstJson.pageId);

    const key = `pages/${firstJson.pageId}/raw.html`;
    const headBefore = await env.KB_BUCKET.head(key);
    const uploadedBefore = headBefore!.uploaded.getTime();

    const second = await storePage(sourceId, url, "<p>v2 — updated</p>");
    expect(second.status).toBe(200); // existing row → 200, not 201
    const secondJson: PageResult = await second.json();
    expect(secondJson.changed).toBe(true);
    expect(secondJson.pageId).toBe(firstJson.pageId); // supersede-in-place: same id

    expect(await contentHashOf(firstJson.pageId)).not.toBe(hashV1);

    // Exactly one row for (source,url).
    const count = await env.KB_DB.prepare(
      "SELECT COUNT(*) AS n FROM pages WHERE source_id = ? AND url = ?",
    )
      .bind(sourceId, url)
      .first<{ n: number }>();
    expect(count!.n).toBe(1);

    // R2 raw blob reflects the new content AND was rewritten (uploaded changed).
    const headAfter = await env.KB_BUCKET.head(key);
    expect(headAfter!.uploaded.getTime()).not.toBe(uploadedBefore);

    const get = await call(`/v1/kb/pages/${firstJson.pageId}`);
    const detail: PageDetail = await get.json();
    expect(detail.html).toBe("<p>v2 — updated</p>");
  });

  it("returns 404 when the source is unknown", async () => {
    const res = await storePage(
      "00000000-0000-0000-0000-000000000000",
      "https://bg3.wiki/x",
      "<p>x</p>",
    );
    expect(res.status).toBe(404);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("source_not_found");
  });

  it("rejects an invalid body with 400", async () => {
    const sourceId = await createSource();
    const res = await call("/v1/kb/pages", {
      method: "POST",
      headers: AUTH,
      jsonBody: { sourceId, url: "nope", html: "" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a malformed JSON body with 400", async () => {
    const res = await call("/v1/kb/pages", {
      method: "POST",
      headers: { ...AUTH, "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /v1/kb/pages/:id", () => {
  it("returns 404 for a missing page", async () => {
    const res = await call("/v1/kb/pages/does-not-exist");
    expect(res.status).toBe(404);
    const body: ErrorBody = await res.json();
    expect(body.error).toBe("page_not_found");
  });

  it("returns markdown when r2_md_key is set and html=null when raw key absent", async () => {
    // Phase 4 will set r2_md_key; here we seed it directly (with null raw key)
    // to exercise both the markdown-present and html-absent read branches.
    const now = Date.now();
    await env.KB_DB.prepare(
      "INSERT INTO sources (id, name, base_url, tier, created_at) VALUES (?, ?, ?, ?, ?)",
    )
      .bind("src-md", "MD Source", "https://md.test", 1, now)
      .run();
    await env.KB_DB.prepare(
      "INSERT INTO pages (id, source_id, url, content_hash, r2_md_key, crawled_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind("page-md", "src-md", "https://md.test/p", "h", "pages/page-md/clean.md", now, now)
      .run();
    await env.KB_BUCKET.put("pages/page-md/clean.md", "# Clean markdown");

    const get = await call("/v1/kb/pages/page-md");
    expect(get.status).toBe(200);
    const detail: PageDetail = await get.json();
    expect(detail.html).toBeNull();
    expect(detail.markdown).toBe("# Clean markdown");
  });
});

describe("GET /v1/kb/pages (list)", () => {
  it("paginates by cursor", async () => {
    const sourceId = await createSource("Paginated");
    const stored: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await storePage(sourceId, `https://bg3.wiki/p${i}`, `<p>${i}</p>`);
      const j: PageResult = await res.json();
      stored.push(j.pageId);
    }

    const page1 = await call(`/v1/kb/pages?source=${sourceId}&limit=2`);
    const p1: { items: { id: string }[]; nextCursor: string | null } = await page1.json();
    expect(p1.items).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();

    const seen = new Set(p1.items.map((i) => i.id));
    let cursor = p1.nextCursor;
    while (cursor !== null) {
      const r = await call(`/v1/kb/pages?source=${sourceId}&limit=2&cursor=${cursor}`);
      const j: { items: { id: string }[]; nextCursor: string | null } = await r.json();
      for (const it of j.items) seen.add(it.id);
      cursor = j.nextCursor;
    }
    expect(seen.size).toBe(5);
    for (const id of stored) expect(seen.has(id)).toBe(true);
  });

  it("rejects a missing source param with 400", async () => {
    const res = await call("/v1/kb/pages");
    expect(res.status).toBe(400);
  });
});
