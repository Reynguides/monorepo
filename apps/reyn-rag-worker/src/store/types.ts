/**
 * Object store seam. Persists raw HTML, normalised markdown, and image bytes
 * keyed by R2 path. The mock path is an in-memory Map; the r2 path delegates
 * to the R2 bucket binding.
 */

export interface PutOptions {
  contentType?: string;
}

export interface IObjectStore {
  put(key: string, value: string | ArrayBuffer, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

/** Errors raised by object stores surface a consistent shape. */
export class ObjectStoreError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "ObjectStoreError";
  }
}
