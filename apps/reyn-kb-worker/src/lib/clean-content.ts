/**
 * Source-specific content cleaning applied AFTER extraction, BEFORE chunking
 * (ADR-0018 seam). Removes site/source boilerplate that HTMLRewriter's generic
 * drop-list misses and that QA found as chunk-zero junk — driven entirely by the
 * per-source `clean` config in `sources.ts` (no logic per source). Three rules,
 * applied in order:
 *
 * - `truncateAfterHeadings`: positional tail cut. At the first block/section
 *   whose heading contains a marker (e.g. "Related Guides"), drop it and
 *   everything after — handles trailing link-spam sections.
 * - `dropSectionsByHeading`: drop every block/section whose heading PATH contains
 *   a marker, wherever it sits — handles a junk section that isn't at the tail
 *   (e.g. game8's top "What can you do as a free member?" promo + subsections).
 * - `dropBlockPatterns`: a block whose collapsed text matches any pattern is
 *   removed — handles standalone boilerplate (ads, nav labels, promos).
 *
 * Pure + deterministic. Unknown/absent config → returns the input unchanged.
 */
import type { ExtractedContent, ExtractedSection } from "./extract.ts";
import type { TextBlock } from "./chunking.ts";
import type { SourceCleanConfig } from "./sources.ts";

/** True if any " > "-separated segment of `headingPath` contains a marker (ci). */
function headingPathHasMarker(headingPath: string | null, markers: readonly string[]): boolean {
  if (headingPath === null) return false;
  const segments = headingPath.toLowerCase().split(" > ");
  return markers.some((m) => segments.some((seg) => seg.includes(m.toLowerCase())));
}

/** True if `heading` itself contains a marker (case-insensitive). */
function headingHasMarker(heading: string, markers: readonly string[]): boolean {
  const h = heading.toLowerCase();
  return markers.some((m) => h.includes(m.toLowerCase()));
}

function truncateBlocks(blocks: readonly TextBlock[], markers: readonly string[]): TextBlock[] {
  const cut = blocks.findIndex((b) => headingPathHasMarker(b.headingPath, markers));
  return cut < 0 ? [...blocks] : blocks.slice(0, cut);
}

function truncateSections(
  sections: readonly ExtractedSection[],
  markers: readonly string[],
): ExtractedSection[] {
  const cut = sections.findIndex((s) => headingHasMarker(s.heading, markers));
  return cut < 0 ? [...sections] : sections.slice(0, cut);
}

/**
 * Apply a source's clean config to extracted content. Returns the same object
 * reference when no config is supplied (cheap no-op for sources without rules).
 */
export function cleanExtracted(
  extracted: ExtractedContent,
  clean?: SourceCleanConfig,
): ExtractedContent {
  if (clean === undefined) return extracted;
  const truncate = clean.truncateAfterHeadings ?? [];
  const dropSections = clean.dropSectionsByHeading ?? [];
  const patterns = clean.dropBlockPatterns ?? [];

  let blocks =
    truncate.length > 0 ? truncateBlocks(extracted.blocks, truncate) : [...extracted.blocks];
  let sections =
    truncate.length > 0 ? truncateSections(extracted.sections, truncate) : [...extracted.sections];

  if (dropSections.length > 0) {
    blocks = blocks.filter((b) => !headingPathHasMarker(b.headingPath, dropSections));
    sections = sections.filter((s) => !headingPathHasMarker(s.headingPath, dropSections));
  }
  if (patterns.length > 0) {
    blocks = blocks.filter((b) => !patterns.some((p) => p.test(b.text)));
  }

  return { ...extracted, blocks, sections };
}
