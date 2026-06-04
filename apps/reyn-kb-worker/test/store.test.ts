import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { R2ObjectStore, type R2BucketBinding } from "../src/store/R2ObjectStore.ts";
import { MockObjectStore } from "../src/store/MockObjectStore.ts";
import { createObjectStore } from "../src/store/factory.ts";
import { ObjectStoreError } from "../src/store/types.ts";

function makeStubBucket(): R2BucketBinding {
  const m = new Map<string, { value: string | ArrayBuffer; contentType: string | undefined }>();
  return {
    put: (key, value, options) => {
      m.set(key, { value, contentType: options?.httpMetadata?.contentType });
      return Promise.resolve({});
    },
    get: (key) => {
      const e = m.get(key);
      if (e === undefined) return Promise.resolve(null);
      const v = e.value;
      return Promise.resolve({
        text: () => Promise.resolve(typeof v === "string" ? v : new TextDecoder().decode(v)),
        arrayBuffer: () =>
          Promise.resolve(
            typeof v === "string" ? (new TextEncoder().encode(v).buffer as ArrayBuffer) : v,
          ),
        ...(e.contentType !== undefined ? { httpMetadata: { contentType: e.contentType } } : {}),
      });
    },
    delete: (key) => {
      m.delete(key);
      return Promise.resolve();
    },
  };
}

describe("R2ObjectStore (injected stub bucket)", () => {
  it("round-trips text + content-type, reads bytes, and deletes", async () => {
    const store = new R2ObjectStore(makeStubBucket());
    await store.put("a.md", "# hi", { contentType: "text/markdown" });
    expect(await store.get("a.md")).toBe("# hi");
    const bytes = await store.getBytes("a.md");
    expect(bytes!.contentType).toBe("text/markdown");
    expect(new TextDecoder().decode(bytes!.body)).toBe("# hi");
    await store.delete("a.md");
    expect(await store.get("a.md")).toBeNull();
  });

  it("returns null on a miss for get + getBytes; put without contentType is fine", async () => {
    const store = new R2ObjectStore(makeStubBucket());
    expect(await store.get("missing")).toBeNull();
    expect(await store.getBytes("missing")).toBeNull();
    await store.put("raw", new TextEncoder().encode("x").buffer as ArrayBuffer);
    expect((await store.getBytes("raw"))!.contentType).toBeNull();
  });
});

describe("MockObjectStore", () => {
  it("round-trips text + bytes and deletes", async () => {
    const store = new MockObjectStore();
    await store.put("k", "hello", { contentType: "text/plain" });
    expect(await store.get("k")).toBe("hello");
    const b = await store.getBytes("k");
    expect(b!.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(b!.body)).toBe("hello");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
    expect(await store.getBytes("k")).toBeNull();
  });
});

describe("createObjectStore factory", () => {
  it("returns the mock store under OBJECT_STORE=mock", () => {
    expect(createObjectStore({ ...env, OBJECT_STORE: "mock" })).toBeInstanceOf(MockObjectStore);
  });

  it("returns the R2 store under OBJECT_STORE=r2 with KB_BUCKET present", () => {
    expect(createObjectStore({ ...env, OBJECT_STORE: "r2" })).toBeInstanceOf(R2ObjectStore);
  });

  it("throws when r2 is selected without a KB_BUCKET binding", () => {
    const { KB_BUCKET: _omit, ...rest } = env;
    expect(() => createObjectStore({ ...rest, OBJECT_STORE: "r2" })).toThrow(ObjectStoreError);
  });
});
