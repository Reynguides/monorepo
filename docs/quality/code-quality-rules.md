# Code quality rules

The strict gates established in ADR-0009 are enforced in CI and on
local builds via `Directory.Build.props` (C#) and `eslint.config.js`
+ `tsconfig.json` (TS). This page is the readable mirror of those
files for code review reference.

## C# / .NET

### Compile-time

- `<Nullable>enable</Nullable>` — every reference type is non-null by
  default. `?` opts in to nullable.
- `<TreatWarningsAsErrors>true</TreatWarningsAsErrors>` — analyzer
  warnings break the build. No "fix later" backlog.
- `<AnalysisLevel>latest-recommended</AnalysisLevel>` — the recommended
  set of Microsoft.CodeAnalysis.NetAnalyzers + StyleCop.
- `<EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>` —
  `.editorconfig` rules are checked, not just suggested.

### Analyzers we shipped against

- **`CA1305`** — every `DateTime.ToString` / `string.Format` must pass
  an `IFormatProvider`. We use `CultureInfo.InvariantCulture` for
  machine-readable strings (hashes, JSON, headers).
- **`CA1416`** — Windows-only APIs (DPAPI, WPF) tagged with
  `[SupportedOSPlatform("windows")]`. The `Reyn.Application.Tests`
  project has a mix; Windows-only test classes carry the same
  attribute so the analyser doesn't fire on Linux CI.
- **`CA1822`** — instance methods that don't touch `this` go `static`.
- **`CA1848`** — logging uses source-gen `[LoggerMessage]` callsites,
  not `LoggerExtensions.LogX("…", arg)`. Pattern: a `private static
  partial class Log` inside the host class with one method per event.
- **`CA1859`** — narrow return types where possible.
- **`CA1068`** — `CancellationToken` is the last parameter on every
  async method.
- **`SYSLIB1013`** — `[LoggerMessage]` exception parameters don't get
  a `{Placeholder}` in the message; logger infrastructure formats them
  implicitly.
- **`CS1822` (suppressed locally)** — `OverlayWindow` owns a
  `CancellationTokenSource` and disposes it in `Closed`. CA1001 wants
  the type to be `IDisposable`; we suppress with justification because
  it's not the WPF convention for windows.
- **`NU1701` (suppressed in apps/reyn-desktop)** — LiveCharts'
  transitive SkiaSharp.Views.WPF claims `net461` TFM but runs fine on
  `net8.0-windows`.
- **`CA1001` (suppressed on OverlayWindow)** — see above.

### Banned patterns

- `#pragma warning disable` without an inline justification comment.
- `as unknown as` style double-casts (TS equivalent below).
- `DateTime.Now` / `DateTime.Today` — always `DateTime.UtcNow`. Pinned
  via the `Microsoft.Extensions.Internal.SystemClock` pattern when
  testability matters (`PageViewModelBase`-style clock injection).

## TypeScript

### `tsconfig.json` strictness

- `strict`
- `noUncheckedIndexedAccess` — `array[i]` is `T | undefined`, forces
  bounds discipline.
- `exactOptionalPropertyTypes` — `Foo?: string` ≠ `Foo: string | undefined`.
- `noImplicitOverride`
- `noFallthroughCasesInSwitch`

### ESLint rules (selected)

- `@typescript-eslint/no-explicit-any: error`
- `no-nested-ternary: error`
- `max-lines: ["error", 300]` — files over 300 lines get a refactor
  push.
- `max-lines-per-function: ["error", 60, {skipBlankLines: true}]` —
  functions over 60 lines get extracted. The push handler hit this in
  Phase 5 and split into `parseIdempotencyKey` / `resolveClient` /
  `buildInserts`.
- `complexity: ["error", 10]` — cyclomatic limit. Same Phase 5 push
  handler tripped this and the same split fixed both.
- `@typescript-eslint/no-unsafe-assignment: error`
- `@typescript-eslint/no-floating-promises: error`
- `import/no-duplicates: error`
- `no-restricted-syntax: ban "as unknown as" casts` — every cast must
  go through Zod (`schema.parse(...)`).
- `argsIgnorePattern: ^_` (+ vars/caught/destructured) — standard
  underscore-prefixed unused convention.

### Banned

- `JSON.parse` without an immediate Zod `.parse(...)` validation when
  the source is user-controlled.
- `setTimeout` in production code without a documented reason.

## Lua

- Lua 5.1 compatibility for everything in `apps/reyn-bg3-mod/` — no
  `goto`, no integer division `//`, no bitwise operators. BG3SE is
  pinned to Lua 5.1; CI uses 5.4 (forward-compatible).
- `Ext.*` calls only inside the adapter layer (`Adapter.register`,
  `transport.write`); never inside `Handlers.*` pure functions.
- `(require(...))` parens are mandatory in table constructors —
  `require` returns `(module, path)` and constructors splay multiple
  returns (gotcha discovered in Phase 10's run.lua).

## XAML

- `<Run Text="{Binding ...}"/>` is forbidden. Run is a Freezable;
  bindings on it throw under specific conditions and can take down the
  enclosing UserControl load. Always use `<TextBlock Text="..."/>`
  siblings in a horizontal StackPanel for inline runs. Gotcha
  discovered in Phase 8.
- Views bind to **semantic brush keys** (`BackgroundBrush`, `AccentBrush`,
  `TextPrimaryBrush`, …), never to raw palette swatches. Theming
  swaps the keys via a single merged dictionary.
- Each top-level Window/UserControl has an
  `AutomationProperties.AutomationId` on every interactive element so
  FlaUI can reach it.

## CSS / colors

The brand palette is centralized in `apps/reyn-desktop/Resources/Brushes.xaml`
+ `Themes/Reyn.Dark.xaml` + `Themes/Reyn.Light.xaml`. The semantic
brush keys are the public surface; the swatches change per-theme.

## Pre-commit / pre-push (not enforced today)

No husky / lefthook in tree yet. CI is the only gate. Phase 11+ might
add a thin pre-commit (just `dotnet format` + `pnpm format`) to catch
formatting before a PR opens.
