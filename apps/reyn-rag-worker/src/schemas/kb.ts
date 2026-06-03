import { z } from "zod";

/** Validated at the write boundary with `safeParse`; failures → 400 validation_failed. */

export const StoreSourceRequest = z.object({
  // Optional, caller-supplied id (e.g. a stable catalog id like "bg3-wiki").
  // When present, registration is idempotent on this id; when absent the
  // handler mints a random UUID.
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(256),
  baseUrl: z.string().url().max(2048),
  tier: z.number().int().min(1).max(1000),
});

export type StoreSourceRequest = z.infer<typeof StoreSourceRequest>;

export const StoreSourceResponse = z.object({
  sourceId: z.string(),
});

export type StoreSourceResponse = z.infer<typeof StoreSourceResponse>;

export const StorePageRequest = z.object({
  sourceId: z.string().min(1),
  url: z.string().url().max(2048),
  title: z.string().max(1024).optional(),
  html: z
    .string()
    .min(1)
    .max(4 * 1024 * 1024),
});

export type StorePageRequest = z.infer<typeof StorePageRequest>;

export const StorePageResponse = z.object({
  pageId: z.string(),
  changed: z.boolean(),
});

export type StorePageResponse = z.infer<typeof StorePageResponse>;

export const StoreImageRequest = z.object({
  pageId: z.string().min(1),
  url: z.string().url().max(2048),
  altText: z.string().max(2048).optional(),
  contentBase64: z
    .string()
    .min(1)
    .max(16 * 1024 * 1024),
  // Strict allowlist — SVG is intentionally excluded (inline-script / stored-XSS
  // risk). A disallowed type fails validation → 400 validation_failed.
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
});

export type StoreImageRequest = z.infer<typeof StoreImageRequest>;

export const StoreImageResponse = z.object({
  imageId: z.string(),
});

export type StoreImageResponse = z.infer<typeof StoreImageResponse>;

export const PageDetailResponse = z.object({
  id: z.string(),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  contentHash: z.string(),
  crawledAt: z.number(),
  updatedAt: z.number(),
  html: z.string().nullable(),
  markdown: z.string().nullable(),
});

export type PageDetailResponse = z.infer<typeof PageDetailResponse>;

export const PageListItem = z.object({
  id: z.string(),
  sourceId: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  contentHash: z.string(),
  crawledAt: z.number(),
  updatedAt: z.number(),
});

export type PageListItem = z.infer<typeof PageListItem>;

export const PageListResponse = z.object({
  items: z.array(PageListItem),
  nextCursor: z.string().nullable(),
});

export type PageListResponse = z.infer<typeof PageListResponse>;

/** Query for GET /v1/kb/pages — source required, limit defaults to 50 (cap 500). */
export const PageListQuery = z.object({
  source: z.string().min(1),
  limit: z
    .union([z.string().regex(/^\d+$/), z.undefined()])
    .transform((v) => (v === undefined ? 50 : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive().max(500)),
  cursor: z.union([z.string().min(1), z.undefined()]).transform((v) => v ?? null),
});

export type PageListQuery = z.infer<typeof PageListQuery>;

/** Response for POST /v1/kb/pages/:id/index. */
export const IndexPageResponse = z.object({
  pageId: z.string(),
  chunks: z.number(),
  /** True when the page already had chunks (this call rebuilt them). */
  reindexed: z.boolean(),
});

export type IndexPageResponse = z.infer<typeof IndexPageResponse>;

export const VerifyResponse = z.object({
  pages: z.object({
    total: z.number(),
    missingR2: z.array(z.string()),
  }),
  images: z.object({
    total: z.number(),
    missingR2: z.array(z.string()),
  }),
  chunks: z.object({
    total: z.number(),
    /** Chunk ids with no embedding_state ledger row for the active model. */
    missingEmbedding: z.array(z.string()),
    /** Recorded vector ids that don't resolve in the vector index. */
    missingVector: z.array(z.string()),
  }),
});

export type VerifyResponse = z.infer<typeof VerifyResponse>;
