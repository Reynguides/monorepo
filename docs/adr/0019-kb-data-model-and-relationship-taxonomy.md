# ADR-0019: Knowledge Base data model and page-relationship taxonomy

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The prior PoC modeled the KB as flat `pages` blobs with no relationships and no
rules layer — the substance of the maturity critique. This ADR fixes the shape of
the data the KB stores so that "pages, dependencies, rules" become first-class.
Constraints: BG3-only (no `game_id`); D1 (SQLite); conventions inherited from the
sibling workers (snake_case, TEXT UUID PKs, INTEGER epoch-ms, app-layer FK
integrity).

## Decision

The schema (`migrations/kb-d1/0001_init.sql`) is 11 tables + 1 FTS index:

1. **`sources`** — crawl-source catalog with `tier` (1 = authoritative) + `license`.
2. **`pages`** — structured, not blobs: `page_type`, `summary`, `tags` (JSON),
   `language`, `attribution`, `canonical_url`, `lifecycle`, `version`, plus
   `content_hash` and the R2 keys. **Identity = `UNIQUE(source_id, url)`**;
   `content_hash` is a change-detector, never identity.
3. **`sections`** — a page's heading hierarchy (`heading_path` breadcrumb, `anchor`,
   `level`, `ord`). Chunks point back at their section for provenance.
4. **`page_edges`** — a typed, directed relationship graph. **Edge taxonomy:**
   `link` (in-content hyperlink, the fallback), `see_also`, `prerequisite`,
   `part_of` (section/category membership), `entity_mention` (resolved via
   `entities`), `supersedes` (emitted by the conflict rule). Carries `weight`
   (confidence/strength) and `evidence` (the anchor text / rule clause). The exact
   set is enforced in code at P6, not by the schema (the column is `TEXT`).
5. **`entities`** — named BG3 things (`kind` ∈ class/spell/item/feat/creature/…),
   keyed by `(normalized, kind)`; anchors `entity_mention` edges + typed filters.
6. **`rules`** + **`rule_events`** — table-driven rules + a durable audit trail
   (see [[adr-0020-table-driven-rules-engine]]).
7. **`chunks`** — heading-path-aware retrievable slices; `id` doubles as the
   Vectorize vector id (`{pageId}:{ord}`).
8. **`images`** + **`chunk_images`** — images are stored AND retrievable, linked to
   the chunks that reference them.
9. **`embedding_state`** — the chunk→vector ledger (Vectorize cannot be scanned),
   carrying `model` + `namespace` for reconciliation and reproducible supersede.
10. **`chunks_fts`** — D1 FTS5 keyword index, trigger-synced from `chunks` (see
    [[adr-0023-hybrid-rrf-retrieval]]).

**Repos** are hand-rolled D1 prepared-statement wrappers (one file per table),
returning typed row interfaces — no ORM (per [[adr-0017-knowledge-base-worker-platform-first]]).

## Consequences

**Positive**
- Pages carry the structure needed for typed/filtered search; the relationship
  graph and rules layer exist as first-class data; images are retrievable.
- Identity vs change-detection separation enables idempotent re-ingest +
  supersede-only-on-change.
- The graph lives in plain D1 (indexed `(src,type)`/`(dst,type)`) — enough for
  depth-1 "related pages" expansion, no graph DB.

**Negative**
- More tables + repos to maintain and test than the flat PoC. Mitigated: each repo
  is tiny and unit-tested; the coverage gate enforces it.

**Neutral**
- Page `version` is a monotonic counter, not a history table — supersede is
  destructive (carries forward the prior immutable-page stance). A history table is
  deferred; revisit if audit/rollback of content becomes a requirement.

## Alternatives considered

- **Keep flat pages** — rejected; it is the gap this KB exists to close.
- **A dedicated graph database for relationships** — rejected: not in the Cloudflare
  stack, and depth-1 expansion over an indexed edge table is sufficient.
- **`page_tags` join table instead of JSON `tags`** — deferred: D1 `json1` makes the
  JSON column queryable, and tag cardinality is low; revisit if tag analytics grow.
- **Enforced foreign keys** — rejected: matches the sibling workers (D1 does not
  enable `PRAGMA foreign_keys`); integrity is an app-layer + verify-endpoint concern.

## Verification

- `wrangler d1 migrations apply reyn_kb --local` applies all 11 tables + FTS5 +
  triggers cleanly; `migration.test.ts` asserts table presence + structured-field
  defaults + the `UNIQUE(source_id, url)` constraint; `fts.test.ts` proves the FTS
  triggers sync (insert/delete/update) and `bm25()` ranks.
- Each repo has round-trip unit tests (coverage-gated).

## References

- [[adr-0017-knowledge-base-worker-platform-first]] — the platform-first stance.
- [[adr-0020-table-driven-rules-engine]] — the rules layer this schema stores.
- [[adr-0023-hybrid-rrf-retrieval]] — how `chunks_fts` + Vectorize combine.
- The Knowledge Base implementation plan (data model section).
