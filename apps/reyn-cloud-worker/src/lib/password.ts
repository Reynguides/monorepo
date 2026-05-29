import { bytesToBase64Url } from "./hex.ts";

/**
 * Password hashing — PBKDF2-SHA-256 via crypto.subtle.
 *
 * The plan and ADR-0006 specified argon2id-via-hash-wasm as primary, with
 * PBKDF2 as the fallback. The fallback is now primary because workerd blocks
 * runtime `WebAssembly.compile()` ("Wasm code generation disallowed by
 * embedder"). hash-wasm decodes its WASM bytes at runtime, so it cannot run
 * in Workers without build-time WASM bundling we don't currently support.
 *
 * PBKDF2-SHA-256 @ 100k iterations is OWASP-acceptable for a fallback.
 * Phase 11 may supersede this ADR with @noble/hashes/argon2 (pure JS, no
 * runtime WASM compile).
 */

const PRIMARY = "pbkdf2-sha256";
const ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(plain, salt, ITERATIONS);
  return `${PRIMARY}$i=${ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  // After the length-4 check, all four destructured fields are defined; the
  // non-null assertions below carry that invariant past noUncheckedIndexedAccess.
  const scheme = parts[0]!;
  const iterPart = parts[1]!;
  const saltB64 = parts[2]!;
  const hashB64 = parts[3]!;
  if (scheme !== PRIMARY) return false;
  if (!iterPart.startsWith("i=")) return false;
  const iterations = Number.parseInt(iterPart.slice(2), 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;

  const salt = base64UrlToBytes(saltB64);
  const expected = base64UrlToBytes(hashB64);
  const actual = await derive(plain, salt, iterations);
  return constantTimeEqual(actual, expected);
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // i is bounded by a.length === b.length; both indices are defined.
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}
