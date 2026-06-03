import { z } from "zod";

/**
 * Crawl-state endpoint schemas. The CLI (tools/crawl.ts) reads/writes per-source
 * crawl progress through the Worker; `cursor` is a numeric resume index, the
 * other fields mirror the `crawl_state` row.
 */

export const UpsertCrawlStateRequest = z.object({
  sourceId: z.string().min(1).max(256),
  cursor: z.number().int().min(0),
  status: z.string().min(1).max(64),
  /** epoch ms of the last sitemap fetch; omitted preserves the stored value. */
  lastSitemapAt: z.number().int().min(0).optional(),
});

export type UpsertCrawlStateRequest = z.infer<typeof UpsertCrawlStateRequest>;

export const CrawlStateResponse = z.object({
  cursor: z.number().int().min(0),
  status: z.string(),
  lastSitemapAt: z.number().nullable(),
});

export type CrawlStateResponse = z.infer<typeof CrawlStateResponse>;
