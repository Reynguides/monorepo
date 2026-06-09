import { describe, expect, it, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import "./helpers/setup.ts";
import { call, readJson } from "./helpers/client.ts";
import { upsertSource } from "../src/repo/sources.ts";

interface SourceItem {
  id: string;
  name: string;
  baseUrl: string;
  tier: number;
  license: string | null;
  createdAt: number;
}
interface SourceList {
  sources: SourceItem[];
}

beforeEach(async () => {
  await upsertSource(env.KB_DB, {
    id: "gamerguides",
    name: "Gamer Guides",
    baseUrl: "https://www.gamerguides.com",
    tier: 2,
    createdAt: 1000,
  });
  await upsertSource(env.KB_DB, {
    id: "bg3-wiki",
    name: "BG3 Wiki",
    baseUrl: "https://bg3.wiki",
    tier: 1,
    license: "CC BY-SA",
    createdAt: 2000,
  });
});

describe("GET /v1/kb/sources", () => {
  it("lists registered sources ordered by tier then id with camelCase fields", async () => {
    const res = await call("/v1/kb/sources");
    expect(res.status).toBe(200);
    const { sources } = await readJson<SourceList>(res);
    expect(sources.map((s) => s.id)).toEqual(["bg3-wiki", "gamerguides"]);

    const wiki = sources[0]!;
    expect(wiki.name).toBe("BG3 Wiki");
    expect(wiki.baseUrl).toBe("https://bg3.wiki");
    expect(wiki.tier).toBe(1);
    expect(wiki.license).toBe("CC BY-SA");
    expect(wiki.createdAt).toBe(2000);
    expect(sources[1]!.license).toBeNull();
  });
});
