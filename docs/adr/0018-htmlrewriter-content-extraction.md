# ADR-0018: Extract page content with HTMLRewriter, behind a swappable seam

- **Status**: Accepted — 2026-06-04
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Turning a crawled HTML page into clean, structured text is the single biggest lever on retrieval quality, and it was the weakest part of the prior PoC: `reyn-rag-worker/src/lib/html-clean.ts` is a regex/string-scan cleaner that cannot reliably distinguish article body from navigation/infobox/footer chrome, and it flattens heading structure into plain text.

Per [[adr-0017-knowledge-base-worker-platform-first]] the KB worker is platform-first and minimal-dependency. The Workers-runtime extraction options are:

- **`HTMLRewriter`** — the workerd-native, streaming, SAX-style HTML parser. Zero dependency, zero bundle cost, no DOM materialization.
- **`@mozilla/readability` + a Workers DOM (`linkedom`/`domino`)** — industry-standard main-content extraction, but needs `nodejs_compat`, materializes a DOM, and adds ~400 KB to the bundle.
- **`cheerio`/`jsdom`** — heavy; `jsdom` does not run on workerd.

The KB also needs *structure*, not just text: heading hierarchy (for `sections` and chunk `heading_path`), in-content links (for relationship edges), and image references — so the extractor must emit a structured result, not a markdown blob.

## Decision

1. **Use `HTMLRewriter` as the default content extractor.** A `src/lib/extract.ts` registers element handlers that walk the document once and emit a structured result `{ title, sections[], blocks[], links[], images[] }`:
   - `h1..h6` → open a section, capture heading text + `id`/anchor, maintain the running heading-path stack;
   - `p` / `li` / `td` → text blocks attached to the current section;
   - `a[href]` → in-content link candidates (resolved to relationship edges downstream);
   - `img` → image references with `alt`/dimensions;
   - a drop-list (`script`, `style`, `nav`, `footer`, `aside`, `noscript`, `template`) → ignored.

2. **Put extraction behind an `IContentExtractor` seam** with a factory and a `Mock` implementation, exactly like the embedding/vector/store seams. This keeps the pipeline testable offline and lets the extractor be swapped without touching callers.

3. **Defer `@mozilla/readability`.** It may be introduced later *as an alternate `IContentExtractor` implementation* behind the same seam, gated on (a) a concrete retrieval-quality need HTMLRewriter cannot meet and (b) a bundle-size spike confirming it fits under the Worker limit. Until then it is not a dependency.

## Consequences

**Positive**
- Zero dependency / zero bundle cost; a real parser (not regex) that preserves heading hierarchy, links, and images.
- Streaming + single-pass — cheap CPU on the Worker.
- The seam makes the Readability upgrade a one-file change later, with no rework of chunking/relationship/index code.

**Negative**
- HTMLRewriter has no built-in "main content" heuristic; boilerplate stripping relies on our drop-list + per-source structure rather than Readability's scoring. Acceptable for structured wiki/MediaWiki sources; revisited if a source needs it.

**Neutral**
- The old regex cleaner is not ported as production code; a trivial pass-through `Mock` extractor serves tests.

## Alternatives considered

- **Readability + linkedom now** — rejected for P0–P8: bundle cost and `nodejs_compat` weight without a demonstrated need on structured wiki HTML. Kept as a seam-swappable future option.
- **Keep the regex cleaner** — rejected: it is the documented maturity gap this KB exists to fix.
- **cheerio / jsdom** — rejected: heavy; `jsdom` is not workerd-compatible.

## Verification

- `src/lib/extract.ts` unit-tested against saved HTML fixtures: correct heading hierarchy + heading-path, link extraction, image references, and drop-list removal (P4).
- The extractor is selected via the factory; the `Mock` path is exercised by pipeline tests so coverage stays ≥95/95/95/90.

## References

- [[adr-0017-knowledge-base-worker-platform-first]] — the platform-first stance this implements.
- Cloudflare HTMLRewriter: <https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/>
- Plan: `lively-wibbling-locket` (extraction + sectioning, Phase 4).
