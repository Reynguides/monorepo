/** Per-kind Zod schemas for rule `params`, validated at load/apply time. */
import { z } from "zod";
import { RuleConfigError } from "./types.ts";

export const CanonicalUrlParams = z.object({
  stripParams: z.array(z.string()).default([]),
  lowercaseHost: z.boolean().default(true),
  dropFragment: z.boolean().default(true),
});
export type CanonicalUrlParams = z.infer<typeof CanonicalUrlParams>;

export const DeriveSummaryParams = z.object({ maxChars: z.number().int().positive().default(280) });
export type DeriveSummaryParams = z.infer<typeof DeriveSummaryParams>;

export const MinTextLenParams = z.object({ min: z.number().int().nonnegative() });
export type MinTextLenParams = z.infer<typeof MinTextLenParams>;

export const AllowedPageTypeParams = z.object({ allowed: z.array(z.string()).min(1) });
export type AllowedPageTypeParams = z.infer<typeof AllowedPageTypeParams>;

const EMPTY = z.object({}).strip();

/** kind -> param schema. The presence of a key also defines the known kinds. */
export const RULE_PARAM_SCHEMAS: Record<string, z.ZodTypeAny> = {
  // normalize
  canonical_url: CanonicalUrlParams,
  collapse_whitespace: EMPTY,
  derive_summary: DeriveSummaryParams,
  // validate
  require_title: EMPTY,
  min_text_len: MinTextLenParams,
  allowed_page_type: AllowedPageTypeParams,
  language_is_en: EMPTY,
  // dedup
  near_duplicate_hash: EMPTY,
  same_canonical_url: EMPTY,
  // conflict
  tier_authoritativeness: EMPTY,
};

/** Validate + coerce a rule's raw params for its kind, or throw RuleConfigError. */
export function parseRuleParams(kind: string, raw: unknown): unknown {
  const schema = RULE_PARAM_SCHEMAS[kind];
  if (schema === undefined) {
    throw new RuleConfigError(`unknown rule kind: ${kind}`);
  }
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    throw new RuleConfigError(`invalid params for rule kind ${kind}`, result.error.issues);
  }
  return result.data;
}
