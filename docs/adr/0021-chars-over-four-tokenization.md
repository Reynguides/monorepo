# ADR-0021: Approximate token counts with a chars/4 estimate

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Chunking needs a notion of "how big is this piece" to bound chunk size, and the
`chunks.token_count` column feeds telemetry/tuning. A real tokenizer (e.g.
`js-tiktoken`, or a BGE WordPiece tokenizer) gives exact counts but costs a
dependency + a vocab file in the Worker bundle, against the platform-first /
minimal-deps stance ([[adr-0017-knowledge-base-worker-platform-first]]).

The KB embeds with Workers AI `@cf/baai/bge-base-en-v1.5`. For that path the exact
token count is **retrieval-neutral**: Workers AI truncates over-long inputs itself,
and chunk *sizing* is governed by a character budget (`maxChars`) anyway. Exact
tokenization matters most for an LLM context budget — which is out of scope here
(no generation in the KB).

## Decision

Use a `chars / 4` estimate, `approxTokenCount(text) = ceil(text.length / 4)`, in
`src/lib/tokens.ts`. Chunk sizing uses the character budget directly
(`chunkBlocks` caps `maxChars`); `token_count` stores the estimate. No tokenizer
dependency is added to the Worker.

## Consequences

**Positive**
- Zero dependency / zero bundle cost; deterministic and trivial to test.
- The character budget is the real sizing control; the estimate is sufficient for
  telemetry.

**Negative**
- `token_count` is approximate (English averages ~4 chars/token; off for
  code/CJK). Acceptable: it is telemetry, not a hard budget here.

**Neutral**
- If a consumer ever needs exact counts (e.g. a future LLM context budget),
  `js-tiktoken` can be wrapped behind a tiny `ITokenizer` seam without touching
  callers.

## Alternatives considered

- **`js-tiktoken` now** — rejected: dependency + bundle weight for a count that is
  retrieval-neutral on the BGE path. Deferred behind a future seam.
- **A BGE/WordPiece tokenizer** — rejected: vocab weight, same reasoning.

## Verification

- `approxTokenCount` unit-tested (empty, exact-multiple, round-up).
- Chunk sizing verified in `chunkBlocks` tests (every chunk `<= maxChars`).

## References

- [[adr-0017-knowledge-base-worker-platform-first]] — the minimal-deps stance.
- The Knowledge Base implementation plan (Phase 4).
