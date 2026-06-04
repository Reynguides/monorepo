# ADR-0020: A table-driven rules engine for ingestion

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The maturity critique called out the absence of a "rules" layer. The KB needs to
normalize, validate, deduplicate, and resolve conflicts in crawled content — and
those policies change over time (new tracking params to strip, a new disallowed
page type, a source whose tier outranks another). Hard-coding them in handlers
makes every policy tweak a code change + redeploy, and makes the policies
invisible/untestable.

## Decision

Rules are **data** (rows in the `rules` table) applied by **pure code**:

1. **Four phases**, each a pure function over the candidate (`src/rules/`):
   - `normalize` (`runNormalize`) transforms the candidate: `canonical_url`
     (strip tracking params, drop fragment), `collapse_whitespace`,
     `derive_summary`.
   - `validate` (`runValidate`) inspects it: `require_title`, `min_text_len`,
     `allowed_page_type`, `language_is_en`. An **error**-severity failure blocks
     ingest; a **warn**-severity failure is recorded but non-blocking.
   - `dedup` (`runDedup`) decides `insert | skip | merge`: `near_duplicate_hash`
     (identical bytes → skip), `same_canonical_url` (→ merge into the existing id).
   - `conflict` (`resolveByTier`) prefers the most authoritative source (lowest
     `tier`); a top-tier tie with differing values is reported `unresolved`.
2. **Params are validated per kind with Zod** (`src/rules/params.ts`) at load/apply
   time; an unknown kind or malformed params throws `RuleConfigError` (fail-fast,
   same boundary discipline as ADR-0009).
3. **Every rule application yields a `RuleOutcome`** which the ingest handler (P3)
   records to `rule_events` — a durable, queryable audit trail.

Each phase is a small pure function with no I/O, so the whole engine is unit-tested
over fixtures and carries the 95/95/95/90 gate without any binding.

## Consequences

**Positive**
- Policies are data: tunable by inserting/editing rows, no redeploy; auditable via
  `rule_events`; testable in isolation.
- Clear separation: normalize mutates, validate gates, dedup decides, conflict
  ranks — each independently reasoned about.

**Negative**
- A rule's behavior is split between its row (params) and its code (the `kind`
  impl); a new policy that no existing `kind` covers still needs a code change to
  add the `kind` + its Zod schema. Accepted: the kinds are a small, curated set.

**Neutral**
- `conflict` resolution is heuristic (tier ordering), not semantic fact-checking;
  unresolved ties are surfaced, not auto-decided.

## Alternatives considered

- **Hard-code policies in handlers** — rejected: invisible, untestable, redeploy per
  tweak.
- **A generic expression/DSL evaluated at runtime** — rejected as over-engineering
  for a curated BG3 rule set; a typed `kind` registry is simpler and safer.
- **An external rules-engine library** — rejected per the platform-first/minimal-deps
  stance ([[adr-0017-knowledge-base-worker-platform-first]]); the logic is ~4 small
  pure modules.

## Verification

- `src/rules/*` unit-tested over fixtures: each builtin's pass/fail/transform paths,
  warn-vs-error severity, dedup skip/merge/insert, tier resolution incl. the
  unresolved-tie case, and per-kind param validation (defaults + rejections).
- Wired into the ingest write boundary in P3 (rule outcomes → `rule_events`).

## References

- [[adr-0017-knowledge-base-worker-platform-first]] — minimal-deps stance.
- [[adr-0019-kb-data-model-and-relationship-taxonomy]] — the `rules` + `rule_events`
  tables this engine reads/writes.
- The Knowledge Base implementation plan (Phase 2).
