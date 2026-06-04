# Reyn Knowledge Base — data model

Schema: `migrations/kb-d1/0001_init.sql` (D1 / SQLite). Conventions
([ADR-0019](../adr/0019-kb-data-model-and-relationship-taxonomy.md)): snake_case, TEXT UUID
PKs, INTEGER epoch-ms timestamps, `IF NOT EXISTS`, UNIQUE indexes for dedup. **Foreign keys
are documented but NOT DB-enforced** — the application (repos + the verify endpoint) is the
integrity boundary, which is why [verify](operations.md#verify) checks for dangling refs.

## Tables

| Table | Purpose | Identity |
|---|---|---|
| `sources` | Crawl sources. `tier` (1 = most authoritative) feeds ranking + conflict resolution. | `id` |
| `pages` | First-class structured pages: `page_type`, `summary`, `tags`(JSON), `language`, `canonical_url`, `attribution`, `content_hash`, `r2_raw_key`, `r2_md_key`, `lifecycle`, `version`, timestamps. | `UNIQUE(source_id, url)` |
| `sections` | Heading hierarchy with `heading_path` (e.g. `"Wizard > Spellcasting"`), `level`, `anchor`. | `UNIQUE(page_id, ord)` |
| `page_edges` | The typed relationship graph (the "dependencies"). `edge_type`, `weight`, `evidence`, `dst_page_id?`, `dst_url?`. | `UNIQUE(src_page_id, dst_url, edge_type)` |
| `entities` | Named BG3 things (`class`/`spell`/`item`/…), `normalized` name, `canonical_page_id`. Powers `entity_mention` edges. | `UNIQUE(normalized, kind)` |
| `rules` / `rule_events` | The explicit rules layer + its durable audit trail ([rules](rules.md)). | `id` |
| `chunks` | Retrievable, heading-path-aware text slices. `id = {pageId}:{ord}` (= the Vectorize vector id). | `UNIQUE(page_id, ord)` |
| `images` / `chunk_images` | Retrievable, chunk-linked images. | `images: UNIQUE(page_id, url)`; `chunk_images: PK(chunk_id, image_id)` |
| `embedding_state` | The chunk→vector **ledger**: `vector_id`, `model`, `namespace`, `indexed_at`. Vectorize cannot be enumerated in-Worker, so this is the authoritative map for supersede + verify. | `PK(chunk_id, model)` |
| `chunks_fts` | **FTS5** external-content virtual table over `chunks(text, heading_path)`, kept in sync by `AFTER INSERT/DELETE/UPDATE` triggers, ranked by `bm25()`. | (mirrors `chunks.rowid`) |

## Relationship taxonomy (`page_edges.edge_type`)

| Type | Built from |
|---|---|
| `link` | In-content `<a href>` links, absolutized + deduped, resolved to `dst_page_id` where the URL maps to a known same-source page. |
| `entity_mention` | A registered entity's normalized name appearing as a whole token-run in the page text. |
| `part_of` | Section/heading hierarchy. |
| `prerequisite` / `see_also` | Heading-matched sections or write-API input. |
| `supersedes` | Emitted by the tier-conflict rule: the authoritative page supersedes a lower-tier duplicate (the loser is marked `deprecated`). |

## Page lifecycle

`active` → `stale` → `deprecated` → `deleted`. Set on conflict resolution (loser →
`deprecated`) and surfaced in `GET /stats` (`pagesByLifecycle`) and as a search filter.

## Identity & change detection

- **Page identity** = `(source_id, url)`; re-ingest preserves the stable `id` and bumps
  `version`. `content_hash` is *not* an identity key — it only tells re-ingest whether the
  bytes changed since the last crawl (skip-idempotency).
- **Chunk identity** = `{pageId}:{ord}`, reused across re-indexes so the vector id is stable;
  supersede-on-change deletes the old chunk set (and its vectors + ledger rows + FTS entries)
  before writing the new one — orphan-free ([ADR-0022](../adr/0022-vectorize-metadata-namespaces-supersede.md)).

## FTS5 caveat

The `chunks_fts` virtual table blocks D1 `export`. R2 + `embedding_state` are the durable
source of truth; the FTS index is recreate-on-restore. Drift between the index and the
`chunks` content table is detected by `GET /verify` via FTS5's `integrity-check` (`rank=1`).
