import type { IObjectStore, PutOptions } from "./types.ts";

/** Object returned by R2 `get`; we only consume its `text()` accessor. */
interface R2GetResult {
  text(): Promise<string>;
}

/**
 * Minimal structural view of the R2 bucket binding we depend on. Defined
 * locally so the adapter is trivially unit-testable with a stub; the
 * production binding (`env.KB_BUCKET`) is structurally compatible.
 */
export interface R2BucketBinding {
  put(
    key: string,
    value: string | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2GetResult | null>;
  delete(key: string): Promise<void>;
}

/**
 * Real object store backed by the Cloudflare R2 bucket binding. R2 does have a
 * local emulator, but the adapter is still unit-tested with an injected stub
 * for coverage of the contentType passthrough and the null-on-miss branch.
 */
export class R2ObjectStore implements IObjectStore {
  private readonly bucket: R2BucketBinding;

  constructor(bucket: R2BucketBinding) {
    this.bucket = bucket;
  }

  public async put(key: string, value: string | ArrayBuffer, opts?: PutOptions): Promise<void> {
    const options =
      opts?.contentType !== undefined
        ? { httpMetadata: { contentType: opts.contentType } }
        : undefined;
    await this.bucket.put(key, value, options);
  }

  public async get(key: string): Promise<string | null> {
    const obj = await this.bucket.get(key);
    if (obj === null) {
      return null;
    }
    return await obj.text();
  }

  public async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}
