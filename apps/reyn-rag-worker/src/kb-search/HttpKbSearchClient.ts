import {
  KbSearchError,
  KbSearchResponseSchema,
  type IKbSearchClient,
  type KbSearchRequest,
  type KbSearchResult,
} from "./types.ts";

/** Defaults to the global `fetch`; tests inject a stub. */
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HttpKbSearchClientOptions {
  baseUrl: string;
  fetcher?: FetchLike;
}

/**
 * Real retrieval client: POSTs to the KB worker's open `POST /v1/kb/search`.
 * The `fetcher` is constructor-injected so the adapter is unit-tested with a
 * `vi.fn()` (no live network). The response body is Zod-validated; anything
 * unexpected raises a KbSearchError rather than flowing on untyped.
 */
export class HttpKbSearchClient implements IKbSearchClient {
  private readonly url: string;
  private readonly fetcher: FetchLike;

  constructor(options: HttpKbSearchClientOptions) {
    this.url = `${options.baseUrl.replace(/\/+$/, "")}/v1/kb/search`;
    this.fetcher = options.fetcher ?? fetch;
  }

  public async search(req: KbSearchRequest): Promise<KbSearchResult[]> {
    const payload: Record<string, unknown> = { query: req.query, mode: req.mode ?? "hybrid" };
    if (req.topK !== undefined) payload.topK = req.topK;
    if (req.filters !== undefined) payload.filters = req.filters;

    const res = await this.fetcher(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new KbSearchError(`KB search failed: HTTP ${res.status}`);
    }
    const json: unknown = await res.json();
    const parsed = KbSearchResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new KbSearchError("KB search returned an unexpected response shape");
    }
    return parsed.data.results;
  }
}
