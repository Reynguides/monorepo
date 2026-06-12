# KB chunk cleaning — design spec

**Date:** 2026-06-12
**Branch:** `feat/knowledge-base`
**Status:** design approved (owner). Build test-first. Logic + tests only — no live re-index.

## Goal

Remove the source-specific boilerplate QA found as chunk-zero junk (~30% of chunks on some sources), so the next crawl/re-index produces a clean corpus. Scope is the **cleaning logic + tests** in `apps/reyn-kb-worker`; the deployed KB is re-cleaned later by the full crawl/re-index (owner's "later").

## Mechanism (owner-approved): per-source text/block rules

Reuses the existing per-source `titleSuffix` / `cleanPageTitle` pattern in `sources.ts`.

1. **Config** — extend `SourceDef` with optional:
   ```ts
   clean?: {
     dropBlockPatterns?: RegExp[];      // a block whose collapsed text matches → dropped
     truncateAfterHeadings?: string[];  // at the first heading segment CONTAINING one of these
                                        // (case-insensitive), drop that section + everything after
   }
   ```
2. **Pure cleaner** — new `src/lib/clean-content.ts`: `cleanExtracted(extracted, clean?) → ExtractedContent`. In document order: find the truncation point (first block whose `headingPath` has a segment containing a `truncateAfterHeadings` entry) and cut blocks there; drop any remaining block matching a `dropBlockPattern`; likewise truncate `sections` at the first matching heading. `title`, `links`, `images` pass through unchanged. No `clean` / unknown source → returns input unchanged. Pure, deterministic, fully unit-tested.
3. **Wire** — in `handlers/kb/index-page.ts`, after `extractContent`: `const cleaned = cleanExtracted(extracted, getSource(page.source_id)?.clean)`, then use `cleaned` for `chunkBlocks`, `buildMarkdown`, and `replaceSectionsForPage` (chunks, stored markdown, and the sections table all get the clean set). Relationships still use the full `extracted` for now (link edges are a separate concern — see Out of scope).

## Per-source rules (patterns from the live KB, 2026-06-12)

- **bg3-wiki** — `dropBlockPatterns: [/^Ad placeholder$/i]` (QA: standalone chunk-zero block).
- **fextralife** — nav is ~14 separate `headingPath:null` blocks. Drop each by whole-text match:
  `/^(Home|Wikis|News|Reviews|Guides|Forum|Sign In Now|Recent Changes|New page|File Manager|Members|Page Manager|Settings|Create Wiki)$/`. (Anchored, so a real content block is never matched.)
- **game8** —
  `dropBlockPatterns: [/^Want more information\?Learn more$/i, /Beginner Guides for All Starter Players/]`
  (first = the real collapsed text, no space; second = a distinctive substring of the `★ … ☆ …` promo blob).
  `truncateAfterHeadings: ["Related Guides"]` (substring match → catches `"Baldur's Gate 3 Related Guides"`).

## Tests (95/95/95/90 gate stays green)

`test/clean-content.test.ts` — unit tests on `cleanExtracted`:
- bg3 ad block dropped; fextralife nav labels dropped (multi-block); game8 promo + ★-blob dropped; game8 truncation removes the "Related Guides" section + everything after (incl. later sections), substring heading match.
- no-op when `clean` is undefined / source unknown; **keeps real content** (a normal paragraph survives); sections truncated in lockstep with blocks.
Plus a small `extract → clean` integration test on a fixture mimicking each source's chunk-zero shape, and (if cheap) one `index-page` path assertion that cleaned blocks reach chunks.

## Out of scope (flag, don't silently expand)

- **Live re-index** of the deployed KB (owner does the full crawl later).
- **More game8 chrome** — a "What can you do as a free member?" promo section also appears; not in the QA list. Flagged for owner; easy to add as another pattern/truncate later.
- **Entity decoding** — `Baldur&#39;s` appears undecoded in extracted text (an extractor-level issue, not chunk-cleaning). Flagged separately.
- **Link/image cleaning** for truncated sections (relationship edges) — separate concern.
- **Mid-sentence chunk starts** — owner chose to leave as-is (intentional overlap + oversized hard-split).

## No new ADR

This lives inside ADR-0018's extraction seam (a config-driven post-extract filter). A short note goes in `docs/kb`.
