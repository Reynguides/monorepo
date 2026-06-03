import type { IObjectStore, PutOptions } from "./types.ts";

/**
 * In-memory object store for local dev + tests. Stores values as strings;
 * ArrayBuffer inputs are decoded to UTF-8 text on write so `get` can return a
 * string uniformly (mirrors how the R2 path reads back text bodies).
 */
export class MockObjectStore implements IObjectStore {
  private readonly store = new Map<string, string>();

  public put(key: string, value: string | ArrayBuffer, _opts?: PutOptions): Promise<void> {
    const text = typeof value === "string" ? value : new TextDecoder().decode(value);
    this.store.set(key, text);
    return Promise.resolve();
  }

  public get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  public delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}
