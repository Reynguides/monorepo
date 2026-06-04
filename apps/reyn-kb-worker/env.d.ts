declare module "cloudflare:test" {
  // Augment the cloudflare:test ProvidedEnv with the bindings + vars + secrets
  // configured in vitest.config.ts so test code can read them off `env`.
  // Vectorize and Workers AI have no local emulator, so the selector vars are
  // pinned to "mock" in tests and those bindings are intentionally absent.
  // R2 DOES have a local emulator, so KB_BUCKET is present and OBJECT_STORE="r2".
  // KB_MIGRATIONS carries the kb-d1 SQL applied in test/helpers/setup.ts.
  interface ProvidedEnv {
    KB_DB: D1Database;
    KB_BUCKET: R2Bucket;
    EMBEDDING_PROVIDER: "workers-ai" | "mock";
    VECTOR_INDEX: "vectorize" | "mock";
    OBJECT_STORE: "r2" | "mock";
    KB_INGEST_KEY: string;
    KB_MIGRATIONS: D1Migration[];
  }
}

export {};
