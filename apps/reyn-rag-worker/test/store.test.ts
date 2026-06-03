import { describe, expect, it, vi } from "vitest";
import { createObjectStore } from "../src/store/factory.ts";
import { MockObjectStore } from "../src/store/MockObjectStore.ts";
import { R2ObjectStore, type R2BucketBinding } from "../src/store/R2ObjectStore.ts";
import { ObjectStoreError } from "../src/store/types.ts";
import type { Env } from "../src/types/env.ts";

function baseEnv(overrides: Partial<Env>): Env {
  return {
    KB_DB: {} as D1Database,
    EMBEDDING_PROVIDER: "mock",
    VECTOR_INDEX: "mock",
    OBJECT_STORE: "mock",
    LLM_PROVIDER: "mock",
    ...overrides,
  };
}

describe("createObjectStore", () => {
  it("returns the mock store in mock mode", () => {
    expect(createObjectStore(baseEnv({ OBJECT_STORE: "mock" }))).toBeInstanceOf(MockObjectStore);
  });

  it("returns the R2 store when KB_BUCKET is bound", () => {
    const stub: unknown = {};
    const bucket = stub as R2Bucket;
    expect(createObjectStore(baseEnv({ OBJECT_STORE: "r2", KB_BUCKET: bucket }))).toBeInstanceOf(
      R2ObjectStore,
    );
  });

  it("throws when r2 is selected without the binding", () => {
    expect(() => createObjectStore(baseEnv({ OBJECT_STORE: "r2" }))).toThrow(ObjectStoreError);
  });
});

describe("MockObjectStore", () => {
  it("round-trips string values", async () => {
    const s = new MockObjectStore();
    await s.put("k", "hello");
    expect(await s.get("k")).toBe("hello");
  });

  it("decodes ArrayBuffer values to text", async () => {
    const s = new MockObjectStore();
    const bytes = new TextEncoder().encode("bytes");
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await s.put("k", buf as ArrayBuffer, { contentType: "text/plain" });
    expect(await s.get("k")).toBe("bytes");
  });

  it("returns null for a missing key", async () => {
    const s = new MockObjectStore();
    expect(await s.get("nope")).toBeNull();
  });

  it("round-trips bytes + content-type via getBytes", async () => {
    const s = new MockObjectStore();
    const bytes = new Uint8Array([1, 2, 3, 255]);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await s.put("img", buf, { contentType: "image/png" });
    const got = await s.getBytes("img");
    expect(got).not.toBeNull();
    expect(new Uint8Array(got!.body)).toEqual(bytes);
    expect(got!.contentType).toBe("image/png");
  });

  it("getBytes returns null content-type when none was supplied", async () => {
    const s = new MockObjectStore();
    await s.put("k", "v");
    const got = await s.getBytes("k");
    expect(got!.contentType).toBeNull();
  });

  it("getBytes returns null for a missing key", async () => {
    const s = new MockObjectStore();
    expect(await s.getBytes("nope")).toBeNull();
  });

  it("deletes keys", async () => {
    const s = new MockObjectStore();
    await s.put("k", "v");
    await s.delete("k");
    expect(await s.get("k")).toBeNull();
  });
});

describe("R2ObjectStore", () => {
  function stub(getResult: unknown): R2BucketBinding & {
    put: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  } {
    return {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(getResult),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("passes contentType through as httpMetadata", async () => {
    const s = stub(null);
    await new R2ObjectStore(s).put("k", "v", { contentType: "application/json" });
    expect(s.put).toHaveBeenCalledWith("k", "v", {
      httpMetadata: { contentType: "application/json" },
    });
  });

  it("omits options when no contentType is supplied", async () => {
    const s = stub(null);
    await new R2ObjectStore(s).put("k", "v");
    expect(s.put).toHaveBeenCalledWith("k", "v", undefined);
  });

  it("reads back the object body text", async () => {
    const s = stub({ text: () => Promise.resolve("body") });
    expect(await new R2ObjectStore(s).get("k")).toBe("body");
  });

  it("returns null on a miss", async () => {
    const s = stub(null);
    expect(await new R2ObjectStore(s).get("k")).toBeNull();
  });

  it("getBytes reads arrayBuffer + content-type", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const s = stub({
      text: () => Promise.resolve(""),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
      httpMetadata: { contentType: "image/jpeg" },
    });
    const got = await new R2ObjectStore(s).getBytes("k");
    expect(new Uint8Array(got!.body)).toEqual(bytes);
    expect(got!.contentType).toBe("image/jpeg");
  });

  it("getBytes yields null content-type when httpMetadata is absent", async () => {
    const s = stub({
      text: () => Promise.resolve(""),
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
    });
    const got = await new R2ObjectStore(s).getBytes("k");
    expect(got!.contentType).toBeNull();
  });

  it("getBytes returns null on a miss", async () => {
    const s = stub(null);
    expect(await new R2ObjectStore(s).getBytes("k")).toBeNull();
  });

  it("delegates delete", async () => {
    const s = stub(null);
    await new R2ObjectStore(s).delete("k");
    expect(s.delete).toHaveBeenCalledWith("k");
  });
});
