# Reyn Knowledge Base — rules engine

An **explicit, table-driven rules layer** ([ADR-0020](../adr/0020-table-driven-rules-engine.md)):
rules are data (rows in the `rules` table) applied by pure code functions keyed by `kind`.
This makes the ingestion policy auditable and tunable **without a redeploy**, and the engine
fully unit-testable without bindings. Every outcome is recorded in `rule_events` (the audit
trail).

## Phases

Rules run in four ordered phases at the page **write boundary** (`POST /v1/kb/pages`),
each phase running its enabled rules by `priority`:

| Phase | Question | Builtins |
|---|---|---|
| `normalize` | Clean the page before storage. | `canonical_url`, `collapse_whitespace`, `derive_summary` |
| `validate` | Is the page fit to store? | `require_title`, `min_text_len`, `allowed_page_type`, `language_is_en` |
| `dedup` | Have we already got this? | `same_canonical_url`, `near_duplicate_hash` |
| `conflict` | Which of two same-entity pages wins? | `tier_authoritativeness` |

## Outcomes

- **normalize** mutates the candidate in place (e.g. derives `canonical_url`, `summary`).
- **validate** failures with `severity:"error"` reject the write → `422
  rule_validation_failed` (warnings are recorded but don't block). The failing page is
  surfaced later by `GET /verify` (`pagesWithValidationFailures`).
- **dedup** hits short-circuit the write → `200 { deduped:true }` (no new row).
- **conflict** (run during indexing, on entity registration): the lower-`tier` source wins;
  the loser page is marked `lifecycle="deprecated"` and a `supersedes` edge is emitted.
  A same-tier tie is left unresolved (surfaced by verify).

## Params validation

Each rule's `params` (JSON) is **Zod-validated per `kind` on load** (`src/rules/params.ts`),
so a malformed rule fails fast rather than misbehaving at runtime.

## Audit trail (`rule_events`)

Every applied rule writes a `rule_events` row: `(page_id, rule_id, phase, outcome, detail,
created_at)`. This is the durable record of *why* a page was normalized a certain way,
rejected, deduped, or deprecated — queryable per page and aggregated by `GET /verify`.

## Code map

- `src/rules/types.ts` — phase/kind/severity types.
- `src/rules/params.ts` — per-kind Zod schemas + `parseRuleParams`.
- `src/rules/normalize.ts` · `validate.ts` · `dedup.ts` · `conflict.ts` — the pure phase runners.
- `src/rules/runtime.ts` — `toRuleSpecs` (rows → specs) + `recordRuleEvents`.
- Wired at the write boundary in `src/handlers/kb/pages-write.ts` and at conflict time in
  `src/handlers/kb/build-relationships.ts`.
