/**
 * SHA-256 hex digest of a string — the KB page change-detector: `content_hash`
 * keys nothing (identity is `(source_id, url)` per ADR-0019); it only tells
 * re-ingest whether a page's bytes changed since the last crawl.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return hexDigest(bytes);
}

/**
 * SHA-256 hex digest of raw bytes — used for image uploads so the change-detector
 * hashes the DECODED bytes (not the base64 string), making it the byte-level
 * identity of the stored blob.
 */
export async function sha256HexBytes(buf: ArrayBuffer): Promise<string> {
  return hexDigest(buf);
}

async function hexDigest(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(data));
  let out = "";
  for (const b of new Uint8Array(digest)) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Normalize to a concrete `ArrayBuffer` so the digest argument is unambiguously a
 * `BufferSource`. Under current `@types/node`, `Uint8Array` is generic over
 * `ArrayBufferLike` (which includes `SharedArrayBuffer`) and no longer assigns to the
 * Workers `BufferSource` (an `ArrayBuffer`-backed view) — a one-copy normalize avoids
 * a cast and is version-robust.
 */
function toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}
