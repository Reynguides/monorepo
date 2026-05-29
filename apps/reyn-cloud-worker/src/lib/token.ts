import { bytesToBase64Url, bytesToHex } from "./hex.ts";

/** A new opaque bearer token: 32 random bytes, base64url. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

/**
 * Compute the persisted form of a bearer token: sha256(pepper || token), hex.
 * A leaked DB row alone is useless without the SESSION_PEPPER secret.
 */
export async function hashToken(token: string, pepper: string): Promise<string> {
  if (pepper.length === 0) {
    throw new Error("SESSION_PEPPER must be configured");
  }
  const input = new TextEncoder().encode(pepper + token);
  const digest = await crypto.subtle.digest("SHA-256", input);
  return bytesToHex(new Uint8Array(digest));
}
