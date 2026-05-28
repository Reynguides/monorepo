# ADR-0006: Hash passwords with argon2id via `hash-wasm` in the Cloudflare Worker

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Reyn's Cloudflare Worker (`apps/reyn-cloud-worker`) handles `POST /v1/auth/register` and `POST /v1/auth/login`. We must persist a password verifier — never the password — and we must do it in a way that resists offline attack if the Accounts D1 ever leaks.

The Worker runtime constrains the options:
- **No `node:crypto` Argon2 binding**. Workers run on V8 isolates; native modules are not available.
- **`crypto.subtle` is present** and gives us SHA-256, PBKDF2, HKDF, ECDSA, etc. — but not Argon2.
- **WASM is supported**. `hash-wasm` ships a pure-WASM argon2id implementation (~50KB gzipped) that runs inside the isolate with no native code.

OWASP's current ASVS L1 password storage recommendation (2025) is **argon2id** with parameters at least `m=19 MiB, t=2, p=1` or scrypt with comparable cost. PBKDF2-SHA-256 at `100,000` iterations is OWASP's *fallback* for environments that genuinely cannot run a memory-hard KDF.

The Worker's compiled bundle has a hard size limit (1 MiB on the free tier, 10 MiB on paid). The `hash-wasm` argon2 bundle sits comfortably inside both, but a future SDK upgrade or extra WASM payloads could push us over.

## Decision

1. **Primary password backend: argon2id via `hash-wasm`.** Parameters: `m=19456 (≈19 MiB), t=2, p=1, salt=16 random bytes, hashLength=32`. These are OWASP's 2025 baseline.
2. **Fallback: PBKDF2-SHA-256 (`100,000` iterations, 32-byte derived key)** via `crypto.subtle`. Gated by `env.PASSWORD_BACKEND` (`argon2id|pbkdf2`). Default is `argon2id`. The fallback exists to keep the auth path shippable if (a) the WASM bundle ever pushes us past the size cap, or (b) we discover an isolate-startup latency problem in production traffic.
3. **Storage format**: a single self-describing string `argon2id$m=19456$t=2$p=1$<salt-b64>$<hash-b64>` (PHC-style). The verifier reads back the parameters and runs the same KDF; no out-of-band metadata.
4. **Session tokens** are 32 random bytes (`crypto.getRandomValues(new Uint8Array(32))`) base64url-encoded. The Worker stores `sha256(SESSION_PEPPER || token)` only; the raw token is never persisted. The pepper is in `wrangler secret put SESSION_PEPPER`.
5. **Lazy-loaded WASM**. `hash-wasm` is dynamically imported inside the auth handler only, so requests that never touch auth never pay the WASM init cost.

## Consequences

**Positive**
- A leak of the Accounts D1 yields argon2id verifiers, which are state-of-the-art expensive to attack offline.
- The PHC-style format makes parameter rotation trivial: bump `m` / `t` in a future migration, re-hash on next login.
- The PBKDF2 fallback is the same `crypto.subtle` API as the rest of the Worker, so the codepath is small and well-understood.
- Session tokens cannot be replayed from a D1 leak alone — the attacker also needs `SESSION_PEPPER`, which lives in Cloudflare secret storage, not in any database row.

**Negative**
- Cold-start cost: the first auth request after isolate start runs WASM init (~5–20 ms). Hot requests are unaffected. We accept this latency on a path that already does a network round-trip.
- 50 KB of additional bundle size per Worker. Documented.

**Neutral**
- `hash-wasm` is a community library. Its argon2 implementation matches the reference test vectors and is audit-friendly because it's WASM. If the project goes unmaintained we can swap to another WASM argon2 (e.g. `@noble/hashes`-style) by changing one import.

## Alternatives considered

- **bcrypt**. Not memory-hard; OWASP recommends migrating off. Rejected.
- **scrypt via `crypto.subtle`**. Workers don't expose scrypt through SubtleCrypto today; even if they did, argon2id is the modern preference.
- **Native Argon2 via a sidecar HTTP service**. Adds infrastructure for one CPU primitive. Rejected — we have a perfectly good in-isolate option.
- **Run the KDF on the client (desktop) and POST the verifier**. Rejected — moves the cost of attack to the user's machine, but also moves the *trust* there. A compromised client could send a precomputed verifier. Server-side hashing is the standard.

## Verification

- Vitest cases (Phase 3):
  - `hash(p) !== p` (obvious)
  - `verify(hash(p), p) === true`
  - `verify(hash(p), p + "x") === false`
  - `hash(p) !== hash(p)` (different salt)
  - Parameter round-trip: parse PHC string, run KDF, byte-compare.
  - `PASSWORD_BACKEND=pbkdf2` path: same suite passes.
  - Missing `SESSION_PEPPER` → `verify` rejects token (does not silently allow).
- Integration: `curl POST /v1/auth/register` with a known password, then `curl POST /v1/auth/login` — both 200; a third login with the wrong password — 401.

## References

- OWASP Password Storage Cheat Sheet — <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
- `hash-wasm`: <https://github.com/Daninet/hash-wasm>
- Argon2 RFC 9106 — <https://www.rfc-editor.org/rfc/rfc9106.html>
- [[adr-0002-per-user-d1-via-rest-api]] — argon2id verifiers are stored in `reyn_accounts`, which is the shared Accounts D1.
