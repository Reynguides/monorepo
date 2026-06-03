/**
 * Context assembly for the RAG generation step.
 *
 * Concatenates retrieved chunk texts (best-ranked first) into a single context
 * block the LLM is prompted from, capped at a `maxChars` budget. The budget is a
 * character proxy for a token budget — we use a chars≈token/4 framing elsewhere
 * in the pipeline (see index-page.ts `approxTokenCount`), so a char cap here is a
 * deterministic, tokenizer-free stand-in for "how much context fits".
 *
 * Greedy: chunks are included in order until adding the next one would push the
 * assembled length over `maxChars`, then assembly stops. This keeps the most
 * relevant chunks (callers pass them re-ranked) and never exceeds the budget.
 *
 * Pure + deterministic: same input → same output. No I/O.
 */

/** Separator placed between included chunk texts in the assembled context. */
export const CONTEXT_SEPARATOR = "\n\n---\n\n";

export interface AssembledContext {
  /** The concatenated context, `<= maxChars` (empty when nothing fit). */
  context: string;
  /** How many leading chunks were included before the budget was hit. */
  usedChunks: number;
}

/**
 * Packs chunk texts into a context block up to `maxChars`. Includes chunks in
 * the given order; stops at the first chunk whose addition (text + separator)
 * would exceed the budget. A first chunk that alone exceeds `maxChars` is not
 * included (the budget is a hard cap). Empty input → empty context, 0 used.
 */
export function assembleContext(
  chunks: readonly { text: string }[],
  maxChars: number,
): AssembledContext {
  let context = "";
  let usedChunks = 0;
  for (const chunk of chunks) {
    const addition = usedChunks === 0 ? chunk.text : `${CONTEXT_SEPARATOR}${chunk.text}`;
    if (context.length + addition.length > maxChars) {
      break;
    }
    context += addition;
    usedChunks += 1;
  }
  return { context, usedChunks };
}
