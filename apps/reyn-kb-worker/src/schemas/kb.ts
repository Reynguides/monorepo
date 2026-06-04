/** Zod request schemas for the KB content API. Responses are constructed by us. */
import { z } from "zod";

export const PAGE_TYPES = [
  "spell",
  "class",
  "item",
  "creature",
  "feat",
  "condition",
  "location",
  "quest",
  "mechanic",
  "article",
  "other",
] as const;

export const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

export const StoreSourceRequest = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  baseUrl: z.string().url(),
  tier: z.number().int().min(1).max(1000),
  license: z.string().max(200).optional(),
});
export type StoreSourceRequest = z.infer<typeof StoreSourceRequest>;

export const StorePageRequest = z.object({
  sourceId: z.string().min(1),
  url: z.string().url(),
  html: z.string().min(1).max(4_000_000),
  title: z.string().max(500).optional(),
  pageType: z.enum(PAGE_TYPES).optional(),
  language: z.string().min(2).max(10).optional(),
});
export type StorePageRequest = z.infer<typeof StorePageRequest>;

export const StoreImageRequest = z.object({
  pageId: z.string().min(1),
  url: z.string().url(),
  contentType: z.enum(IMAGE_CONTENT_TYPES),
  dataBase64: z.string().min(1).max(20_000_000),
  altText: z.string().max(2000).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type StoreImageRequest = z.infer<typeof StoreImageRequest>;

export const PageListQuery = z.object({
  source: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().optional(),
});
export type PageListQuery = z.infer<typeof PageListQuery>;
