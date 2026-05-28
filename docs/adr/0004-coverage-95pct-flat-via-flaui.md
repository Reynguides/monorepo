# ADR-0004: 95% line coverage flat across the solution, including WPF UI via FlaUI

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The user has set 95% line coverage as a quality bar — explicitly **flat across the solution**, not 95% on backend with WPF excluded. WPF is the part of the .NET ecosystem most commonly carved out of coverage gates because:

1. `*.g.cs` / `*.g.i.cs` XAML partial classes are auto-generated and add hundreds of lines that nobody writes by hand.
2. Code-behind classes traditionally absorb wiring logic that is hard to unit-test (P/Invoke, dispatcher access, window-handle interop).
3. Headless UI testing on .NET historically meant either WinAppDriver (deprecated direction) or rolling your own automation against UIA.

A real production-grade WPF app **can** hit 95% — but only if (a) code-behind is kept thin, (b) UI behaviour is exercised by a real driver, and (c) genuinely-uncoverable native interop is excluded explicitly rather than by accident.

## Decision

1. **Coverage target: ≥95% line, flat, measured across `Reyn.sln`.** Enforced by Coverlet → ReportGenerator → CI gate (`Threshold=95`). The gate fails the build, no manual override.
2. **UI exercised by FlaUI** (`FlaUI.UIA3` against the running app). Test project `tests/Reyn.Desktop.UiTests/` launches `Reyn.Desktop.exe`, drives buttons / fields / navigation, and asserts on visual-tree state.
3. **MVVM by `CommunityToolkit.Mvvm`** with `[ObservableProperty]` / `[RelayCommand]`. View-models live in `Reyn.Desktop.ViewModels.Tests/` test territory and carry the bulk of testable behaviour.
4. **Permitted exclusions** (documented in `tools/coverage/coverlet.runsettings`):
   - P/Invoke shims — extracted into `OverlayWindowInterop.cs` and decorated `[ExcludeFromCodeCoverage]`. The shim is a thin marshalling layer; testing it would test the OS.
   - Auto-generated XAML partials — `*.g.cs`, `*.g.i.cs`, `GeneratedInternalTypeHelper.cs` filtered by file glob.
   - `App.OnStartup` boot wiring — covered by a smoke FlaUI test that asserts the app launches and shows the splash, instead of by carving an exclusion attribute.
5. **No `[ExcludeFromCodeCoverage]` on production logic.** If a class is hard to cover, that is feedback to refactor it (extract a port, mock its boundary), not to silence the gate.
6. **If a layer falls below 95%, we add tests; we never lower the gate.** The threshold is the bar.

## Consequences

**Positive**
- The 95% number is a **real** signal because it is flat. We don't game it by carving out the hard layer.
- Code-behind stays thin by construction — anything substantial migrates to a view-model so we can test it.
- FlaUI catches integration regressions (binding broken, navigation broken, theme not applied) that view-model unit tests miss.

**Negative**
- FlaUI tests are slow (full app launch per test class) and flaky on CI runners with non-deterministic window timing. We mitigate with a single shared `WindowFixture` per test class and explicit `WaitWhileBusy` calls instead of `Thread.Sleep`.
- Coverage on auto-generated WPF code is filtered, not measured — a regression there (e.g. broken XAML compile) is caught by the build, not coverage. Acceptable.

**Neutral**
- FlaUI requires the test runner to be on Windows and have a real display session. CI uses `windows-latest` runners with their default session.

## Alternatives considered

- **Carve WPF out (`exclude-by-attribute=GeneratedCodeAttribute`) and target 95% on the rest**. Common, easier, and the standard advice. Rejected per user requirement — flat coverage is explicit.
- **WinAppDriver**. Microsoft's direction is unclear; FlaUI is community-maintained, more idiomatic .NET, and uses the same UIA layer.
- **Avalonia / WinUI 3**. Different UI stack with better test ergonomics, but switching the UI framework is out of scope for productionizing this POC.
- **Microsoft.UI.Xaml.Testing**. Targets WinUI, not WPF. Not applicable.

## Verification

`dotnet test Reyn.sln --settings tools/coverage/coverlet.runsettings /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura /p:Threshold=95` — exits non-zero if any of {line, branch, method} coverage falls below 95%. CI gates on the same command.

## References

- FlaUI: <https://github.com/FlaUI/FlaUI>
- Coverlet runsettings reference: <https://github.com/coverlet-coverage/coverlet/blob/master/Documentation/MSBuildIntegration.md>
- [[adr-0009-strict-ts-and-net-quality-gates]] — the TS-side coverage equivalent.
