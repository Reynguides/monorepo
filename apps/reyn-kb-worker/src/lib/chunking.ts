/**
 * Section-aware text chunker. Consumes the heading-path-tagged text blocks the
 * extractor produces, groups consecutive blocks by `headingPath`, and greedily
 * packs each group into windows no larger than `maxChars`, carrying
 * `overlapChars` of trailing context into the next chunk (improves retrieval
 * recall across boundaries). A block larger than `maxChars` is hard-split. Every
 * chunk records the `headingPath` of its content (provenance for retrieval +
 * citation). Pure + deterministic: same input + opts → same chunks.
 */

export interface ChunkOptions {
  /** Maximum characters per chunk. Must be > 0. */
  maxChars: number;
  /** Characters of trailing context carried into the next chunk. 0 <= n < maxChars. */
  overlapChars: number;
}

export interface TextBlock {
  headingPath: string | null;
  text: string;
}

export interface Chunk {
  /** 0-based position within the page (reading order). */
  ord: number;
  text: string;
  headingPath: string | null;
}

interface Unit {
  text: string;
  standalone: boolean;
}

/** Hard-splits an oversized block into <= maxChars pieces with internal overlap. */
function splitOversized(block: string, maxChars: number, overlapChars: number): string[] {
  const pieces: string[] = [];
  const step = Math.max(1, maxChars - overlapChars);
  for (let start = 0; start < block.length; start += step) {
    pieces.push(block.slice(start, start + maxChars));
    if (start + maxChars >= block.length) break;
  }
  return pieces;
}

/** Trailing `overlapChars` of a chunk, used to seed the next chunk's context. */
function tailOverlap(text: string, overlapChars: number): string {
  if (overlapChars <= 0) return "";
  return text.length <= overlapChars ? text : text.slice(text.length - overlapChars);
}

/** Expands oversized blocks into standalone <= maxChars pieces; others pass through. */
function toFittingUnits(blocks: readonly string[], maxChars: number, overlapChars: number): Unit[] {
  const units: Unit[] = [];
  for (const block of blocks) {
    if (block.length > maxChars) {
      for (const piece of splitOversized(block, maxChars, overlapChars)) {
        units.push({ text: piece, standalone: true });
      }
    } else {
      units.push({ text: block, standalone: false });
    }
  }
  return units;
}

/** Opens a fresh buffer seeded with the pending overlap `carry` (best-effort). */
function seedBuffer(carry: string, unitText: string, maxChars: number): string {
  if (carry.length === 0) return unitText;
  const carryBudget = maxChars - unitText.length - 2;
  if (carryBudget <= 0) return unitText;
  const seed = carry.length > carryBudget ? carry.slice(carry.length - carryBudget) : carry;
  return `${seed}\n\n${unitText}`;
}

/** Greedily packs fitting units into overlapping chunk texts. */
function packUnits(units: readonly Unit[], maxChars: number, overlapChars: number): string[] {
  const texts: string[] = [];
  let buffer = "";
  let carry = "";

  const emit = (): void => {
    const text = buffer.trim();
    buffer = "";
    if (text.length === 0) return;
    texts.push(text);
    carry = tailOverlap(text, overlapChars);
  };

  for (const unit of units) {
    if (unit.standalone) {
      emit();
      buffer = unit.text;
      emit();
      continue;
    }
    if (buffer.length === 0) {
      buffer = seedBuffer(carry, unit.text, maxChars);
      continue;
    }
    const candidate = `${buffer}\n\n${unit.text}`;
    if (candidate.length > maxChars) {
      emit();
      buffer = seedBuffer(carry, unit.text, maxChars);
    } else {
      buffer = candidate;
    }
  }
  emit();
  return texts;
}

interface BlockGroup {
  headingPath: string | null;
  texts: string[];
}

/** Group consecutive blocks sharing a heading path (chunks never span sections). */
function groupBlocks(blocks: readonly TextBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  for (const b of blocks) {
    const text = b.text.trim();
    if (text.length === 0) continue;
    const last = groups[groups.length - 1];
    if (last?.headingPath === b.headingPath) {
      last.texts.push(text);
    } else {
      groups.push({ headingPath: b.headingPath, texts: [text] });
    }
  }
  return groups;
}

function assertOptions(opts: ChunkOptions): void {
  if (opts.maxChars <= 0) {
    throw new RangeError("chunkBlocks: maxChars must be > 0");
  }
  if (opts.overlapChars < 0 || opts.overlapChars >= opts.maxChars) {
    throw new RangeError("chunkBlocks: overlapChars must satisfy 0 <= overlapChars < maxChars");
  }
}

/** Chunk heading-path-tagged blocks into ordered, section-tagged chunks. */
export function chunkBlocks(blocks: readonly TextBlock[], opts: ChunkOptions): Chunk[] {
  assertOptions(opts);
  const chunks: Chunk[] = [];
  for (const group of groupBlocks(blocks)) {
    const units = toFittingUnits(group.texts, opts.maxChars, opts.overlapChars);
    for (const text of packUnits(units, opts.maxChars, opts.overlapChars)) {
      chunks.push({ ord: chunks.length, text, headingPath: group.headingPath });
    }
  }
  return chunks;
}
