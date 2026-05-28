# ADR-0008: On sync conflict, server-wins; clients reconcile by pulling the server row

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

Reyn's data model has two categories of synced state:

1. **Immutable event records** (`events` table). These are append-only — once written, they describe a thing that happened in BG3 at a specific instant. They are not edited by the user. Conflict between client and server on an event row should be impossible by construction.
2. **Aggregates and user-mutable state**: `achievements_state` (unlocked / progress), `event_summaries` (rolled-up per-day counts), and `play_sessions` (start/end metadata). These *can* be updated: an achievement unlocks, a play-session ends, a daily summary gets revised when a late event arrives.

A user with two devices (laptop + desktop), or a single device that did work offline and pushed it later, can create real divergence on category 2: each side has a copy of `achievements_state[unbroken_chain]` and both edited it differently.

We need an unambiguous rule before any code is written, because conflict-resolution policy is the single design decision that is most painful to retrofit.

## Decision

1. **For event rows (category 1): `INSERT OR IGNORE`.** Dedup is by `(event_id, content_hash)` per [[adr-0007-event-id-uuidv7-content-hash-dedup]]. There is no update path; "conflicts" are not conflicts, they are duplicates, and the server keeps the first writer.

2. **For mutable aggregates (category 2): server-wins, last-write-wins by server clock.**
   - Each mutable row has `server_updated_at INTEGER` (epoch ms, set by the Worker on write).
   - On `POST /v1/sync/push`, the client sends `{ resource, id, client_updated_at, payload }`. The server **ignores `client_updated_at`** for the actual decision and writes unconditionally, stamping its own `server_updated_at`. Why: client clocks are not trustworthy, and the user's intent ("apply my change") is what they pressed Save for.
   - The server's response includes the new `server_updated_at`. If the client had a *newer* local version it was about to push, it has now lost — and is expected to re-pull the server state on the next sync cycle, surfacing the loss to the user via a "Synced changes from server" toast.

3. **Pull is authoritative** for category 2. Clients periodically `GET /v1/sync/pull?since=<server_updated_at>` for aggregates. Whatever the server returns overwrites the local row.

4. **No CRDTs, no operational-transform, no per-field merge.** The aggregates are small, the user rarely mutates them, and the cost of a wrong merge is "user has to re-edit"; the cost of a CRDT runtime is "we maintain a CRDT runtime."

## Consequences

**Positive**
- Single, easy-to-reason-about rule. Two devices fighting over `achievements_state[x]`: last one to call the server wins; the other sees the change after its next pull.
- The Worker is stateless about clients' clocks. We never have to argue about whether a client's `client_updated_at` was honest.
- Implementation is one `INSERT … ON CONFLICT DO UPDATE` per resource type.

**Negative**
- A user editing two devices offline can lose a change without warning. Mitigated by: (a) most category-2 rows are derived from category-1 events and so re-derivable, (b) the post-sync toast on the losing client surfaces the conflict.
- We cannot offer "merge my changes" UX. Documented as a roadmap item if real users ever ask for it.

**Neutral**
- Server-wins implies the Worker is the source of truth. That's already the architectural assumption — desktop is a cache, Worker + D1 is the canonical store.

## Alternatives considered

- **Client-wins, last-write-by-`client_updated_at`**. Trusts client clocks. Cheap to fool and historically a vulnerability vector (e.g. a client setting `client_updated_at = 9999999999` to force-win). Rejected.
- **Vector clocks / Lamport timestamps**. Real merge semantics, but no current product affordance for the user to *see* a conflict. We'd be paying for infrastructure no one uses.
- **CRDTs (Automerge / Yjs)**. Solves multi-device editing rigorously but adds a runtime and serialisation format we have to maintain on both stacks. Wildly overbuilt for "did the user unlock achievement X yet."
- **Manual conflict UI**. The user is asked to choose. Bad: most category-2 changes are not interesting enough to warrant a dialog.

## Verification

- Worker tests:
  - Pushing the same `achievements_state` row twice with the same id → second write replaces first; `server_updated_at` advances.
  - Pushing an event row twice → second is ignored; `server_updated_at` does not exist on event rows (immutable).
- Desktop test:
  - Local edit then pull where server has a newer version → local copy is overwritten; UI surfaces a status update.

## References

- [[adr-0007-event-id-uuidv7-content-hash-dedup]] — the dedup primitive that makes "no conflict on events" trivially true.
- Martin Kleppmann, *Designing Data-Intensive Applications*, Ch.5 "Replication" — the basis for the "last-write-wins by server clock" choice over `client_updated_at`.
