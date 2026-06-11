import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";

const AUTH = { Authorization: "Bearer test-ingest-key" };

interface WriteResp {
  pageId: string | null;
  changed: boolean;
}
interface PageDetail {
  title: string;
  pageType: string;
  canonicalUrl: string;
  html: string;
}
interface PageList {
  items: unknown[];
  nextCursor: string | null;
}

async function seedSource(): Promise<void> {
  await upsertSource(env.KB_DB, {
    id: "s1",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    createdAt: Date.now(),
  });
}

function postPage(jsonBody: unknown): Promise<Response> {
  return call("/v1/kb/pages", { method: "POST", headers: AUTH, jsonBody });
}

describe("KB pages API", () => {
  beforeEach(seedSource);

  it("stores raw html + metadata and serves it back", async () => {
    const res = await postPage({
      sourceId: "s1",
      url: "https://bg3.wiki/Fireball",
      html: "<html><body><h1>Fireball</h1></body></html>",
      title: "Fireball",
      pageType: "spell",
    });
    expect(res.status).toBe(200);
    const { pageId, changed } = await readJson<WriteResp>(res);
    expect(changed).toBe(true);

    const get = await call(`/v1/kb/pages/${pageId!}`);
    expect(get.status).toBe(200);
    const page = await readJson<PageDetail>(get);
    expect(page.title).toBe("Fireball");
    expect(page.pageType).toBe("spell");
    expect(page.canonicalUrl).toBe("https://bg3.wiki/Fireball");
    expect(page.html).toContain("Fireball");
  });

  it("is idempotent on unchanged content_hash", async () => {
    const b = { sourceId: "s1", url: "https://bg3.wiki/A", html: "<p>x</p>" };
    const first = await readJson<WriteResp>(await postPage(b));
    const second = await readJson<WriteResp>(await postPage(b));
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.pageId).toBe(first.pageId);
  });

  it("404s on an unknown source and 400s on an invalid body", async () => {
    const notFound = await postPage({
      sourceId: "ghost",
      url: "https://bg3.wiki/Z",
      html: "<p>z</p>",
    });
    expect(notFound.status).toBe(404);
    const bad = await postPage({ sourceId: "s1", url: "not-a-url", html: "<p>z</p>" });
    expect(bad.status).toBe(400);
  });

  it("lists pages by source with cursor pagination", async () => {
    for (const n of [1, 2, 3]) {
      await postPage({ sourceId: "s1", url: `https://bg3.wiki/p${n}`, html: `<p>${n}</p>` });
    }
    const page1 = await readJson<PageList>(await call("/v1/kb/pages?source=s1&limit=2"));
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await readJson<PageList>(
      await call(`/v1/kb/pages?source=s1&limit=2&cursor=${page1.nextCursor!}`),
    );
    expect(page2.items.length).toBe(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("404s GET for an unknown page id and 400s list without a source", async () => {
    expect((await call("/v1/kb/pages/ghost")).status).toBe(404);
    expect((await call("/v1/kb/pages")).status).toBe(400);
  });
});
