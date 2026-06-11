/**
 * Worker bindings + vars + secrets. Mirrors wrangler.toml.
 *
 * This is the RAG CONSUMER worker. It has NO Cloudflare resource bindings:
 * retrieval is delegated to the KB worker's search API over HTTP, and
 * generation goes to OpenRouter via the Cloudflare AI Gateway. Only selector
 * vars + AI-Gateway/OpenRouter config + one optional secret are needed.
 *
 * Missing config for a selected provider fails fast in the relevant factory
 * with a clear message rather than erroring at first use.
 */
export interface Env {
  // Vars (wrangler.toml) — selectors + routing.
  /** Retrieval client: "http" calls KB_BASE_URL; "mock" returns canned results. */
  KB_SEARCH: "http" | "mock";
  /** Origin of the deployed KB worker; required under KB_SEARCH=http. */
  KB_BASE_URL?: string;
  /** Generation: "mock" (deterministic) or "openrouter" (live, via AI Gateway). */
  LLM_PROVIDER: "mock" | "openrouter";
  /** Cloudflare AI Gateway account id; required under LLM_PROVIDER=openrouter. */
  AI_GATEWAY_ACCOUNT_ID?: string;
  /** Cloudflare AI Gateway name; required under LLM_PROVIDER=openrouter. */
  AI_GATEWAY_NAME?: string;
  /** OpenRouter model slug; required under LLM_PROVIDER=openrouter. */
  OPENROUTER_MODEL?: string;

  // Secrets
  /** OpenRouter API key; required only under LLM_PROVIDER=openrouter. */
  OPENROUTER_API_KEY?: string;
}
