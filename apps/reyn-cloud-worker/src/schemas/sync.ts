import { z } from "zod";

/**
 * UUIDv7 looks like any UUID on the wire; we accept any RFC 4122 string and
 * trust the version byte at write time. The server doesn't replay-validate
 * the version — that's an ADR-0007 *expectation*, not a contract enforced
 * here, since the server doesn't care about ordering semantics.
 */
const UuidString = z.string().uuid();

export const ClientEvent = z.object({
  eventId: UuidString,
  type: z.string().min(1).max(128),
  occurredAt: z.number().int().nonnegative(),
  payloadJson: z.string().min(2).max(64 * 1024),
});

export type ClientEvent = z.infer<typeof ClientEvent>;

export const PushRequest = z.object({
  events: z.array(ClientEvent).min(1).max(500),
});

export type PushRequest = z.infer<typeof PushRequest>;

export const PushResponseSchema = z.object({
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
});

export type PushResponseSchema = z.infer<typeof PushResponseSchema>;

export const PullQuery = z.object({
  since: z
    .union([z.string().regex(/^\d+$/), z.undefined()])
    .transform((v) => (v === undefined ? null : Number.parseInt(v, 10))),
  limit: z
    .union([z.string().regex(/^\d+$/), z.undefined()])
    .transform((v) => (v === undefined ? 100 : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive().max(500)),
});

export type PullQuery = z.infer<typeof PullQuery>;

/** Optional `Idempotency-Key` header — ASCII printable, ≤ 128 chars. */
export const IdempotencyKey = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:\-]+$/);
