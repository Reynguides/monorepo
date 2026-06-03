/**
 * SHA-256 hex digest of a string. Used as the KB page change-detector per
 * ADR-0016: `content_hash` keys nothing — it only tells re-ingest whether a
 * page's bytes changed since the last crawl. Adapted from
 * apps/reyn-cloud-worker/src/lib/content-hash.ts; here it just hashes a string.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return hexDigest(bytes);
}

/**
 * SHA-256 hex digest of raw bytes. Used for image uploads so the change-detector
 * hashes the DECODED bytes (not the base64 string), making it the byte-level
 * identity of the stored blob.
 */
export async function sha256HexBytes(buf: ArrayBuffer): Promise<string> {
  return hexDigest(buf);
}

async function hexDigest(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  let out = "";
  for (const b of new Uint8Array(digest)) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}
