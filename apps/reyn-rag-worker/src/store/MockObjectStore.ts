import type { IObjectStore, ObjectBytes, PutOptions } from "./types.ts";

interface MockEntry {
  bytes: Uint8Array;
  contentType: string | null;
}

/**
 * In-memory object store for local dev + tests. Stores the raw bytes plus the
 * supplied content-type. `get` decodes to UTF-8 text (mirrors how the R2 path
 * reads back text bodies); `getBytes` returns the bytes verbatim with the
 * stored content-type for binary payloads (images).
 */
export class MockObjectStore implements IObjectStore {
  private readonly store = new Map<string, MockEntry>();

  public put(key: string, value: string | ArrayBuffer, opts?: PutOptions): Promise<void> {
    const bytes =
      typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.store.set(key, { bytes, contentType: opts?.contentType ?? null });
    return Promise.resolve();
  }

  public get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve(new TextDecoder().decode(entry.bytes));
  }

  public getBytes(key: string): Promise<ObjectBytes | null> {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return Promise.resolve(null);
    }
    const copy = entry.bytes.slice();
    const body = copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
    return Promise.resolve({ body, contentType: entry.contentType });
  }

  public delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}
