# Architecture overview

Reyn is a single-user Baldur's Gate 3 companion app with three independent
runtime components and a small shared library.

```text
┌─────────────────────┐      ┌────────────────────────┐      ┌────────────────────┐
│  reyn-bg3-mod       │      │  reyn-desktop          │      │  reyn-cloud-worker │
│  (Lua / BG3SE)      │      │  (.NET 8 / WPF)        │      │  (Cloudflare D1)   │
│                     │      │                        │      │                    │
│  Osiris listeners   │ JSONL│  • Splash + Auth       │ HTTPS│  • /v1/auth/*      │
│  → catalog event    │─────▶│  • Dashboard + pages   │─────▶│  • /v1/sync/push   │
│  → file (jsonl)     │      │  • Overlay HUD         │      │  • /v1/sync/pull   │
│                     │      │  • SQLite + outbox     │      │  • Accounts D1     │
└─────────────────────┘      │  • Sync processor      │      │  • Per-user D1     │
                             └────────────────────────┘      └────────────────────┘
                                       ▲ Mock + socket sources
                                       │ + BG3 process detector
```

## Components

### `reyn-desktop` (`apps/reyn-desktop/`)
WPF .NET 8 single-user app. Owns the auth flow, the dashboard pages, the
click-through overlay, and the local SQLite database. Pushes events to the
worker over HTTPS via a hosted `OutboxProcessor` (Phase 5 — exp-backoff
retry, dead-letter at 10 attempts, idempotent push).

Window topology:
1. **`SplashWindow`** — frameless, fade-in, "checking session…" indicator.
2. **`AuthShellWindow`** — sign in / create account; bypasses to MainShell
   on existing valid session.
3. **`MainShell`** — post-auth dashboard with a left-rail nav (Dashboard /
   Timeline / Achievements / Events / Settings) and a top-right sync badge.
4. **`OverlayWindow`** — click-through HUD shown only while BG3 is
   running (per Phase 9 process detector). Renders a small bottom-right
   card with session timer + party HP rings + last-event ticker.

Layer split (per ADR-0001):
- `Reyn.Domain` — entities + identifiers. No deps.
- `Reyn.Application` — interfaces (`IAuthClient`, `IEventSyncClient`,
  `IGameEventQueryService`, `IGameEventSource`, `IGameDetector`,
  `IAuthTokenSource`/`IAuthTokenStore`, `IBg3DetectionPublisher`/Writer),
  DTOs, exception taxonomies, BackoffPolicy.
- `Reyn.Infrastructure` — EF Core, HttpClient impls, P/Invoke wrappers,
  Mock + Socket event sources, BG3 process detector.
- `Reyn.Contracts` — wire DTOs + the `Bg3EventTypes` mirror of the catalog.
- `Reyn.Desktop.ViewModels` — pure VMs (net8.0, WPF-free) so unit tests
  stay headless.
- `Reyn.Desktop` — WPF Views, code-behind, P/Invoke shim, App.xaml.cs.

### `reyn-cloud-worker` (`apps/reyn-cloud-worker/`)
Cloudflare Worker (TypeScript, Hono + Zod + vitest-pool-workers).

Endpoints:
- `POST /v1/auth/register` — PBKDF2-SHA-256 password hashing (per
  ADR-0006), creates a session and provisions the user's data D1.
- `POST /v1/auth/login` — re-issues a session token.
- `POST /v1/auth/logout` — revokes a session.
- `GET  /v1/me` — current user check used by the desktop on cold start.
- `POST /v1/sync/push` — idempotent event ingestion (per ADR-0007 +
  ADR-0008); honours `Idempotency-Key`.
- `GET  /v1/sync/pull` — cursor-paginated event rehydration for fresh
  installs.

Storage:
- **Accounts D1** (`reyn_accounts`) — users, sessions, user_databases map.
- **Per-user data D1** (`reyn_user_data_<id>`) — events, summaries,
  achievements, play_sessions. Provisioned dynamically via the Cloudflare
  REST API on register (per ADR-0002). A shared D1
  (`reyn_user_data_shared`) is used in `PROVISIONER=shared` mode for
  local dev.

### `reyn-bg3-mod` (`apps/reyn-bg3-mod/`)
BG3 Script Extender Lua mod. Subscribes to 14 high-signal Osiris events
and writes catalog-shaped newline-delimited JSON to
`%LocalAppData%\…\Reyn\bg3-events.jsonl`. The desktop's
`Bg3FileEventSource` (Phase 11) watches that file alongside the existing
loopback TCP `Bg3SocketEventSource` (for external producers).

## Shared library

`packages/event-catalog/` is the **single source of truth** for the BG3
event type list and payload schemas. It's mirrored by convention in
`src/Reyn.Contracts/Events/Bg3EventCatalog.cs` (C#) and
`apps/reyn-bg3-mod/ScriptExtender/Lua/Catalog.lua` (Lua) — every
addition must update all three until a Phase 11+ codegen step lands.

## Data flow (event lifecycle)

1. **Capture** — BG3 fires an Osiris event → mod's handler → writes a
   line to `bg3-events.jsonl`.
2. **Ingest** — desktop's `Bg3FileEventSource` watches the file → emits
   `IncomingGameEvent` records through `IGameEventSource`.
3. **Persist** — Ingestion processor writes the event to SQLite
   (`GameEvent` row). EF `OutboxEnqueuingInterceptor` piggybacks a
   `SyncOutboxEntry` in the same `SaveChanges`.
4. **Sync** — `OutboxProcessor` (hosted service, 5s poll) reads pending
   outbox rows in batches of 100 and pushes via `IEventSyncClient`. On
   success, rows flip to `Synced`. On transient/auth failure → exp
   backoff. On permanent or after `MaxAttempts=10` → `DeadLettered`.
5. **Store remotely** — Worker `/v1/sync/push` recomputes the
   content_hash and `INSERT OR IGNORE`s into the user's D1.
6. **Display** — dashboard pages query via `IGameEventQueryService` →
   EF projections from SQLite.

## Cross-cutting

- **Logging** — `Microsoft.Extensions.Logging` with source-generated
  `[LoggerMessage]` callsites (ADR-0009 / CA1848).
- **Tokens** — DPAPI-protected at `%LocalAppData%\Reyn\auth.bin`
  (CurrentUser scope; Phase 6). `DpapiTokenStore` implements both
  `IAuthTokenStore` (write) and `IAuthTokenSource` (read), letting the
  outbox processor consume tokens without coupling to the auth flow.
- **Theming** — semantic brush keys (`BackgroundBrush`, `AccentBrush`,
  `TextPrimaryBrush`, …) bound to dark + light palettes; views never
  bind to raw swatches.

See `monorepo.md` for the folder layout and `data-isolation.md` for the
multi-D1 model.
