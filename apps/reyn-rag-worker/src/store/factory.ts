import type { Env } from "../types/env.ts";
import { MockObjectStore } from "./MockObjectStore.ts";
import { R2ObjectStore } from "./R2ObjectStore.ts";
import { ObjectStoreError, type IObjectStore } from "./types.ts";

/**
 * Selects the active object store per `env.OBJECT_STORE`. Throws an
 * ObjectStoreError if the r2 mode is requested without the KB_BUCKET binding —
 * fail-fast at the boundary instead of at first use.
 */
export function createObjectStore(env: Env): IObjectStore {
  switch (env.OBJECT_STORE) {
    case "mock":
      return new MockObjectStore();
    case "r2": {
      if (env.KB_BUCKET === undefined) {
        throw new ObjectStoreError("KB_BUCKET binding must be present when OBJECT_STORE=r2");
      }
      // The R2 bucket binding is structurally compatible with R2BucketBinding.
      return new R2ObjectStore(env.KB_BUCKET);
    }
  }
}
