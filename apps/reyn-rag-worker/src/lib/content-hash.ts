/**
 * SHA-256 hex digest of a string. Used as the KB page change-detector per
 * ADR-0016: `content_hash` keys nothing — it only tells re-ingest whether a
 * page's bytes changed since the last crawl. Adapted from
 * apps/reyn-cloud-worker/src/lib/content-hash.ts; here it just hashes a string.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  let out = "";
  for (const b of new Uint8Array(digest)) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
