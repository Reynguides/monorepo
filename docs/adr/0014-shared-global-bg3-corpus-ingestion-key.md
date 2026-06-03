# ADR-0014: Shared/global, BG3-only KB corpus with open reads and ingestion-key-gated writes

- **Status**: Accepted — 2026-06-03
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Reyn's event data is per-user, isolated in dedicated D1s ([[adr-0002-per-user-d1-via-rest-api]]). The RAG knowledge base is a different kind of data: **public reference content** (a game wiki), identical for every consumer. We must decide its ownership model and access control, and how game-agnostic the schema is for this PoC.

## Decision

The KB is a **single shared/global corpus**: one `KB_DB` (D1), one global Vectorize index, one R2 bucket — **no `user_id` partitioning** and **no coupling to Reyn's session auth or provisioner**. The schema is **BG3-only** (no `game_id` dimension yet). **Reads are open**; **write/ingest endpoints** (`POST /v1/kb/pages`, `/v1/kb/images`, `/v1/kb/pages/:id/index`) require `Authorization: Bearer <KB_INGEST_KEY>` enforced by a small middleware, so a publicly-routable worker can't be poisoned.

## Consequences

**Positive**
- Simplest model that matches what a wiki is; no provisioning, no per-user fan-out.
- Open reads make the future website trivial to wire; key-gated writes prevent KB poisoning.

**Negative**
- No per-user isolation (not needed for public reference data).
- A shared ingestion key is coarse (no per-writer identity) — acceptable for a single-owner PoC.

**Neutral**
- Multi-game support is a future migration (add `game_id` + a Vectorize namespace per game), deliberately out of PoC scope.

## Alternatives considered

- **Per-user isolation (reuse the provisioner).** Rejected — wrong model for public reference data; large complexity for no benefit.
- **Multi-game schema now.** Deferred — YAGNI for a BG3 PoC; cheap-ish to add later via namespace + column.
- **Full session auth on writes.** Rejected — reintroduces the auth coupling this ADR removes; an ingestion key is sufficient.

## Verification

- `GET` endpoints succeed without auth; `POST` write endpoints return `401` without a valid `KB_INGEST_KEY`.
- Schema review confirms no `user_id` / `game_id` columns in `migrations/kb-d1/0001_init.sql`.

## References

- [[adr-0002-per-user-d1-via-rest-api]] — the per-user model this corpus intentionally does *not* use.
- [[adr-0016-page-identity-url-supersede-in-place]] — how mutable pages are keyed within this corpus.
