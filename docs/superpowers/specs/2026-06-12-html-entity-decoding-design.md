# HTML entity decoding — design spec

**Date:** 2026-06-12
**Branch:** `feat/knowledge-base`
**Status:** design approved (owner, via chat). Build test-first. Logic + tests only — no live re-index.

## Problem

Extracted text carries **un-decoded HTML entities** — `Baldur&#39;s`, `&nbsp;`, etc. Root cause: HTMLRewriter (ADR-0018, zero-dep streaming parser) returns text chunks **raw**, without resolving entities (a real DOM parser would decode on text extraction). Evidence that the source is single-encoded and HTMLRewriter simply doesn't decode: both a numeric (`&#39;`) and a named (`&nbsp;`) entity survive, and no `&amp;`-littering is seen.

**Impact (why fix):** worst for keyword/BM25 search (junk tokens `39`/`nbsp` pollute the index + break phrase matching) and plain-text display (the overlay shows literal `&#39;`); moderate for embeddings (noise tokens, token waste); low for the LLM (it copes). For a text-quality product (LLM-wiki + overlay) this is foundational hygiene. Not a correctness blocker today.

## Approach (owner-approved): global entity decode in extraction

Orthogonal to the per-source chunk cleaning (which drops junk *blocks*) — this is a **global text normalization** applied to every captured string (title, headings, blocks, link text), so all sources benefit with no per-source config. Keeps ADR-0018's zero-runtime-dep stance (no `he` library).

1. **New pure module** `src/lib/html-entities.ts`: `decodeHtmlEntities(text): string`.
   - **All numeric** entities via one regex: decimal `&#39;` and hex `&#x27;` → `String.fromCodePoint` (guarded: out-of-range / invalid code point → left as-is, no throw).
   - **A small map of common named** entities that appear in real prose: `amp lt gt quot apos nbsp rsquo lsquo ldquo rdquo mdash ndash hellip` → their real Unicode chars (`&nbsp;`→U+00A0, `&rsquo;`→’, …).
   - Unknown named entities → **left unchanged** (don't guess; full 2k-entity table not worth the bundle).
   - **Single pass** (correct for single-encoded sources; decoding already-decoded text is a safe no-op).
2. **Wire into `extract.ts` `collapse()`**: decode **before** whitespace-collapse, so a decoded `&nbsp;` (U+00A0, which `\s` matches) is then normalized to a regular space and trimmed. `collapse()` already runs on title/heading/block/anchor text → one change covers all.

## Tests (95/95/95/90 gate stays green)

- `test/html-entities.test.ts` (unit): numeric decimal + hex; each named entity in the map; unknown named entity left intact; lone/å malformed `&` left intact; out-of-range numeric left intact; a real `&amp;` decode; idempotent on already-decoded text; empty string.
- Extend the extract test: an **end-to-end** assertion that `extractContent` on HTML containing `Baldur&#39;s Gate&nbsp;3 &amp; more` yields decoded, whitespace-normalized block text (the real proof through HTMLRewriter; also confirms the single-pass diagnosis).

## Out of scope

- Live re-index (rides the owner's deferred full crawl).
- Full named-entity table (only the common prose set is mapped).
- Double-encoded sources (none observed; would need a second pass — revisit only if a source shows `&amp;#39;`).

## No new ADR

Lives inside ADR-0018's extraction seam (a normalization step in `collapse()`).
