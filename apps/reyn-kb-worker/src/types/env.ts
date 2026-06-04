/**
 * Worker bindings + vars + secrets. Mirrors wrangler.toml.
 *
 * Bindings with no local emulator (Workers AI, Vectorize) and R2 are optional
 * (`?`) so tests running entirely on the mock provider seams never require
 * them. The secret is typed here; if a required secret is missing at runtime
 * the relevant middleware/factory fails fast with a clear message rather than
 * erroring at first use.
 *
 * Scope note (ADR-0017): this is the Knowledge Base worker — there is NO LLM
 * provider here. Answer generation is a future consumer of the search API.
 */
export interface Env {
  // D1 binding — knowledge-base bookkeeping (always present, has a local emulator).
  KB_DB: D1Database;

  // R2 object store — raw HTML / markdown / images. Required only under OBJECT_STORE=r2.
  KB_BUCKET?: R2Bucket;
  // Vectorize index — chunk embeddings. No local emulator; required only under VECTOR_INDEX=vectorize.
  VECTORIZE?: VectorizeIndex;
  // Workers AI — embeddings. No local emulator; required only under EMBEDDING_PROVIDER=workers-ai.
  AI?: Ai;

  // Vars (wrangler.toml) — provider selectors.
  EMBEDDING_PROVIDER: "workers-ai" | "mock";
  VECTOR_INDEX: "vectorize" | "mock";
  OBJECT_STORE: "r2" | "mock";

  // Secrets
  /** Shared secret authorising write/ingest requests into the KB (ADR-0017). */
  KB_INGEST_KEY?: string;
}
