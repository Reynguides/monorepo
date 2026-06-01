# Monorepo layout

Reyn is a hybrid .NET + TypeScript + Lua monorepo. The root holds the
solution file (`Reyn.sln`) and the pnpm workspace (`pnpm-workspace.yaml`);
each apps/ and packages/ subdirectory is its own buildable unit.

```text
Reyn/
├── Reyn.sln                          # .NET solution at root
├── Directory.Build.props             # nullable+warnaserror+analysis level
├── Directory.Packages.props          # Central Package Management
├── global.json                       # pins .NET 8 SDK
├── package.json                      # pnpm workspace root (private)
├── pnpm-workspace.yaml               # packages/* + apps/*
├── pnpm-lock.yaml
├── cspell.json                       # docs spell-check dictionary
├── CLAUDE.md                         # entry doc — read this first
├── README.md                         # quickstart
│
├── apps/
│   ├── reyn-desktop/                 # WPF .NET 8 single-user app
│   │   ├── Reyn.Desktop.csproj
│   │   ├── App.{xaml,xaml.cs}        # boot wiring; DI host setup
│   │   ├── Converters/               # Bool/String/PageState/Fraction → Visibility/Width
│   │   ├── Resources/                # Brushes, Typography, Shadows, Spacing, Cards (XAML)
│   │   ├── Themes/                   # Reyn.Dark.xaml + Reyn.Light.xaml
│   │   └── Views/
│   │       ├── Splash/               # SplashWindow
│   │       ├── Auth/                 # AuthShell + Login + Register
│   │       ├── Shell/                # MainShell + nav rail
│   │       │   ├── Controls/         # PageStateControl (Loading / Empty / Error)
│   │       │   └── Pages/            # Dashboard/Timeline/Achievements/Events/Settings + PageTemplates
│   │       └── Overlay/              # OverlayWindow + OverlayWindowInterop (P/Invoke)
│   │
│   ├── reyn-cloud-worker/            # Cloudflare Worker (Hono + Zod + vitest-pool-workers)
│   │   ├── src/
│   │   │   ├── index.ts              # Hono routes
│   │   │   ├── handlers/{auth,sync}/ # request handlers
│   │   │   ├── lib/                  # password (PBKDF2), token, content-hash, errors, hex
│   │   │   ├── provisioning/         # Dedicated / Shared / Mock user-D1 provisioner
│   │   │   ├── repo/                 # users + sessions + user_databases prepared statements
│   │   │   ├── schemas/              # Zod request/response schemas
│   │   │   ├── sync/                 # push/pull types
│   │   │   ├── types/                # Env + AuthVariables
│   │   │   └── user-data/            # IUserDatabaseClient (Shared / Rest / Mock) + factory
│   │   ├── test/                     # vitest tests (110 total)
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── reyn-bg3-mod/                 # BG3SE Lua mod scaffold
│       ├── meta.lsx                  # mod metadata + UUID
│       ├── ScriptExtender/Lua/       # init.lua + BootstrapServer + Catalog + transport + json
│       └── tests/lua/                # pure-Lua test harness (30 tests)
│
├── packages/
│   └── event-catalog/                # @reyn/event-catalog (TS, Zod) — single source of truth
│       └── src/index.ts              # 28 catalog event types
│
├── src/
│   ├── Reyn.Domain/                  # entities + identifiers (UUIDv7)
│   ├── Reyn.Application/             # interfaces + DTOs + Auth/Sync/Ingestion/Queries
│   ├── Reyn.Infrastructure/          # EF Core, HttpClients, sync impls, ingestion, demo seeder
│   ├── Reyn.Contracts/               # wire DTOs + Bg3EventCatalog C# mirror
│   └── Reyn.Desktop.ViewModels/      # pure VMs (net8.0, WPF-free)
│
├── tests/
│   ├── Reyn.Domain.Tests/            # (TBD; ADR-0009 invariants)
│   ├── Reyn.Application.Tests/       # query + sync + ingestion + auth (115 tests)
│   ├── Reyn.Infrastructure.Tests/    # EF migrations smoke (4 tests)
│   ├── Reyn.Desktop.ViewModels.Tests # VM unit tests (50 tests)
│   └── Reyn.Desktop.UiTests/         # FlaUI (24 tests, Category-tagged)
│
├── migrations/
│   ├── accounts-d1/0001_init.sql     # users + sessions + user_databases
│   └── user-d1/
│       ├── 0001_init.sql             # events + summaries + achievements + play_sessions
│       └── 0002_sync_idempotency.sql # cached push responses
│
├── tools/
│   └── coverage/coverlet.runsettings # exclusions documented
│
├── docs/
│   ├── adr/                          # 10 architectural decision records
│   ├── architecture/                 # this file + overview + data-isolation + sync
│   ├── cloudflare/                   # accounts-api + d1-sync + local-dev + per-user-d1
│   ├── events/bg3-event-catalog.md
│   ├── integrations/bg3-mod.md
│   ├── operations/                   # runbook + cloudflare-bootstrap
│   ├── quality/code-quality-rules.md
│   ├── testing/test-strategy.md
│   ├── ui/                           # game-ui-direction + screenshots
│   ├── roadmap.md
│
└── .github/workflows/
    ├── ci.yml                        # 5 jobs: dotnet + worker + lua + docs + secrets-scan
    └── deploy-worker.yml             # workflow_dispatch only
```

## Why this shape

- **Solution at root** — `dotnet build Reyn.sln` from the repo root just
  works; tooling (Rider, VS, `dotnet ef`) doesn't need extra arguments.
- **pnpm workspace at root** — every `npm` / `pnpm` command runs from
  one lockfile; CI installs once and every workspace package resolves.
- **Layer projects under `src/`** — clean architecture splits without
  nested `src/Reyn/Reyn.Domain/` indirection.
- **Tests parallel to source under `tests/`** — easy to locate; the
  default `dotnet test Reyn.sln` discovers all test projects.
- **Apps under `apps/`** — each is an independently runnable artifact
  (desktop = WinExe, worker = wrangler-deployed, mod = static files).
