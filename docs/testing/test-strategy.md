# Test strategy

Reyn ships **four** test layers across three runtimes. This page is the
map: what each layer covers, where the tests live, and what they
exclude. The 95% line / 90% branch floor (ADR-0004) is enforced in CI.

## .NET (`Reyn.sln`, 193 tests)

### `Reyn.Infrastructure.Tests` (4)
EF migrations smoke + in-memory SQLite shape assertions. Verifies that
the full schema (8 tables) materialises and the migration history
records the right rows.

### `Reyn.Application.Tests` (115)
The bulk of the suite.

- **`Sync/`** — `BackoffPolicy`, `OutboxProcessor` (start/stop loop +
  transient/permanent/auth retry semantics + dead-letter at MaxAttempts),
  `EventSyncStatusPublisher`, `OutboxEnqueuingInterceptor` (in-memory
  SQLite), `HttpEventSyncClient` (WireMock.Net for status-mapping +
  Idempotency-Key + retry semantics).
- **`Auth/`** — `HttpAuthClient` (WireMock.Net per-endpoint status
  mapping) + `DpapiTokenStore` (Windows-only, temp file).
- **`Queries/`** — `GameEventQueryService` against in-memory SQLite with
  seeded fixtures; covers every projection.
- **`Demo/`** — `DemoDataSeeder` populates / idempotency / level-up
  coverage.
- **`Ingestion/`** — `MockBg3EventGenerator` (deterministic + cancellable
  + every emitted type in the catalog), `Bg3SocketEventSource`
  (loopback round-trip + malformed-line skip + cancellation),
  `Bg3DetectionPublisher` + `Bg3ProcessDetectorService` (stubbed
  detector — no real process probing in tests).

### `Reyn.Desktop.ViewModels.Tests` (50)
Pure VM tests — `net8.0`, no WPF reference. Covers AuthShell, Login,
Register, MainShell navigation, OpenSync command, Splash, every page
VM's Loading → Empty/Ready/Error transition, Events filter logic
(chip toggle, source change, clear, capacity), Overlay (timer
formatting, ticker capacity, prefix-stripping, party-ring zero-max).

### `Reyn.Desktop.UiTests` (24)
FlaUI + UIA3 end-to-end tests on `net8.0-windows`. Categories:
- **`Auth`** — splash visibility, AuthShell form fields, switch to
  register.
- **`Navigation`** — cold-start dashboard, nav to each section, sync
  badge routes to settings, populated demo screenshots (with
  `--skip-auth --demo-mode`), overlay screenshot.

Capture: each test maximizes + topmost-pins the window via `SetWindowPos`
during `Capture.Element` so occluding apps don't bleed through. The
overlay screenshot still includes some desktop bleed because the
overlay is a transparent layered window; Phase 11+ work could swap to
in-process `RenderTargetBitmap`.

## TypeScript (`apps/reyn-cloud-worker/`, 110 tests)

`vitest-pool-workers` runs each test inside a miniature Workers
runtime. Coverage thresholds enforced in `vitest.config.ts`:
**`lines: 95, functions: 95, statements: 95, branches: 90`**.

Layout:
- `test/helpers/` — `setup.ts` applies migrations, `client.ts` is the
  in-process Hono `fetch` helper.
- `test/handlers/` — every endpoint's status codes + happy + edge paths.
- `test/lib/`, `test/repo/`, `test/provisioning/`, `test/user-data/`,
  `test/sync/` — unit tests for each module.

Coverage exclusions: `src/index.ts` (just routes wiring) and
`src/types/**` (declaration-only).

## Lua (`apps/reyn-bg3-mod/`, 30 tests)

Pure-Lua harness (`tests/lua/helpers.lua`, under 100 LoC). The `Ext`
table is stubbed; tests verify:
- JSON encoder (escape rules, stable key order, NaN rejection).
- Transport batching (threshold, flush interval, RELATIVE_PATH).
- BootstrapServer handlers (catalog mapping, optional fields, full
  bootstrap → emit through transport pipeline).

Run with `lua apps/reyn-bg3-mod/tests/lua/run.lua` (Lua 5.1 or 5.4).

## What gets excluded from the .NET 95% floor

Documented in `tools/coverage/coverlet.runsettings`:
- Test assemblies themselves (`[*.Tests]*`).
- `[ExcludeFromCodeCoverage]`-attributed types (e.g.
  `OverlayWindowInterop` — the P/Invoke shim).
- XAML-generated partials (`*.g.cs`, `*.g.i.cs`) under `obj/`.
- EF Core scaffolded migrations (`Persistence/Migrations/*.cs`).
- Designer-only files (`*.Designer.cs`).

Nothing else is excluded. If a sub-layer's coverage drops, write a test
— the gate fails the build, never lower it.

## Local test commands

```powershell
# Everything
dotnet build Reyn.sln -warnaserror
dotnet test Reyn.sln --settings tools/coverage/coverlet.runsettings

# Worker only
cd apps/reyn-cloud-worker
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test:coverage

# Lua mod only
lua apps/reyn-bg3-mod/tests/lua/run.lua

# Worker quick smoke
pnpm test                  # no coverage
```

CI runs the same commands across five jobs (see
`.github/workflows/ci.yml`).
