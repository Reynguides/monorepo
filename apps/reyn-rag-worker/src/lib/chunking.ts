/**
 * Heading/paragraph-aware text chunker for the RAG ingestion pipeline.
 *
 * Splits cleaned text into blocks on blank lines and markdown headings, then
 * greedily packs consecutive blocks into windows no larger than `maxChars`,
 * carrying `overlapChars` of trailing text from each emitted chunk into the
 * next so adjacent chunks share context (helps retrieval recall across
 * boundaries). A single block larger than `maxChars` is hard-split into
 * `maxChars`-sized pieces (also with overlap) rather than emitted oversized.
 *
 * Pure + deterministic: same input + opts → same chunk array (stable `ord`s).
 */

export interface ChunkOptions {
  /** Maximum characters per chunk. Must be > 0. */
  maxChars: number;
  /** Characters of trailing context carried into the next chunk. 0 = none. */
  overlapChars: number;
}

export interface Chunk {
  /** 0-based position of this chunk within the page (reading order). */
  ord: number;
  text: string;
}

/** Splits text into blocks on blank lines and heading lines, dropping empties. */
function splitIntoBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    const joined = current.join("\n").trim();
    if (joined.length > 0) {
      blocks.push(joined);
    }
    current = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine;
    if (line.trim().length === 0) {
      // Blank line → block boundary.
      flush();
      continue;
    }
    if (/^#{1,6}\s/.test(line.trim())) {
      // A heading starts a new block (keep it attached to following lines).
      flush();
      current.push(line);
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

/**
 * A block to pack. `standalone` units come from hard-splitting an oversized
 * block: they already carry their own internal overlap and exactly fill
 * `maxChars`, so the packer emits them on their own WITHOUT a carry prefix
 * (prepending one would push the chunk over `maxChars`).
 */
interface Unit {
  text: string;
  standalone: boolean;
}

/** Hard-splits an oversized block into <= maxChars pieces with internal overlap. */
function splitOversized(block: string, maxChars: number, overlapChars: number): string[] {
  const pieces: string[] = [];
  // step must advance by at least 1 char to terminate even if overlap >= max.
  const step = Math.max(1, maxChars - overlapChars);
  for (let start = 0; start < block.length; start += step) {
    pieces.push(block.slice(start, start + maxChars));
    if (start + maxChars >= block.length) {
      break;
    }
  }
  return pieces;
}

/** Trailing `overlapChars` of a chunk, used to seed the next chunk's context. */
function tailOverlap(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) {
    return overlapChars <= 0 ? "" : text;
  }
  return text.slice(text.length - overlapChars);
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

/**
 * Opens a fresh non-standalone buffer seeded with the pending `carry` so
 * adjacent chunks share context. The carry is part of the buffer's budget: a
 * non-standalone unit is `<= maxChars`, so only as much trailing carry as still
 * fits under `maxChars` is seeded (best-effort overlap), trimming from the front
 * if needed. This guarantees the opened buffer is `<= maxChars`.
 */
function seedBuffer(carry: string, unitText: string, maxChars: number): string {
  if (carry.length === 0) {
    return unitText;
  }
  const carryBudget = maxChars - unitText.length - 2; // 2 = "\n\n" separator
  if (carryBudget <= 0) {
    return unitText;
  }
  const seed = carry.length > carryBudget ? carry.slice(carry.length - carryBudget) : carry;
  return `${seed}\n\n${unitText}`;
}

/**
 * Greedily packs fitting units into overlapping chunks (the core loop).
 *
 * Overlap is made part of the size budget rather than prepended at emit time:
 * each fresh non-standalone buffer is *seeded* with the previous chunk's trailing
 * `overlapChars` (the `carry`), so the normal greedy `candidate > maxChars` flush
 * logic already accounts for it. This keeps every emitted chunk `<= maxChars`
 * (the carry can no longer push a chunk over the cap). Standalone pieces — from
 * hard-splitting an oversized block — are emitted on their own without a carry
 * seed (they already exactly fill `maxChars`).
 */
function packUnits(units: readonly Unit[], maxChars: number, overlapChars: number): Chunk[] {
  const chunks: Chunk[] = [];
  let buffer = "";
  // Trailing overlap of the last emitted chunk, seeded into the next buffer.
  let carry = "";

  const emit = (): void => {
    const text = buffer.trim();
    buffer = "";
    if (text.length === 0) {
      return;
    }
    chunks.push({ ord: chunks.length, text });
    carry = tailOverlap(text, overlapChars);
  };

  for (const unit of units) {
    if (unit.standalone) {
      // Flush any pending buffer, then emit the pre-sized piece on its own
      // (no carry seed — it already fills maxChars exactly).
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
  return chunks;
}

/**
 * Chunks `text` into ordered windows per {@link ChunkOptions}. Empty or
 * whitespace-only input yields no chunks. Blocks are packed greedily; a block
 * that alone exceeds `maxChars` is hard-split. Each chunk after the first is
 * prefixed with the previous chunk's trailing `overlapChars`.
 */
export function chunkText(text: string, opts: ChunkOptions): Chunk[] {
  const { maxChars, overlapChars } = opts;
  if (maxChars <= 0) {
    throw new RangeError("chunkText: maxChars must be > 0");
  }
  if (overlapChars < 0 || overlapChars >= maxChars) {
    throw new RangeError("chunkText: overlapChars must satisfy 0 <= overlapChars < maxChars");
  }

  const blocks = splitIntoBlocks(text);
  if (blocks.length === 0) {
    return [];
  }
  const units = toFittingUnits(blocks, maxChars, overlapChars);
  return packUnits(units, maxChars, overlapChars);
}
