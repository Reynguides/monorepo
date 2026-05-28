# ADR-0005: Delete the Dota 2 GSI, AI hint, and knowledge-base scaffolding

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The current repo (`Overlay-in-game-WPF`) contains several files left over from the original "Dota 2 overlay with Gemini-powered hints" prototype that the project pivoted away from:

- `GsiServer.cs`, `GameState.cs`, `IGameStateProvider.cs` — HTTP listener on `127.0.0.1:3000` for Dota 2 GSI POSTs.
- `AiHintService.cs` — wraps a Gemini API call.
- `ContextBuilder.cs` — assembles a prompt from `GameState` + a knowledge-base snippet.
- `KnowledgeBase.cs` + `kb.json` — keyword-indexed snippets of Dota hero/item lore.
- `Controllers/ProxyController.cs` — an ASP.NET Web API controller that is **never reachable** in this WPF app (no Kestrel host is running it; WPF's `Application` does not host Web API).

`MainWindow.xaml.cs:75-85` shows all the Dota-flow plumbing already commented out. Nothing on the live code path references `GsiServer`, `AiHintService`, or the knowledge base; the AI-hint code in `MainWindow.OnSourceInitialized` is `////` -commented to two depths.

Reyn is a BG3 companion. None of the Dota 2 / Gemini surface area is reachable from the new product direction. Keeping it has three concrete costs:

1. It is *plausibly alive* — a future contributor opening `AiHintService.cs` cannot tell from the code whether it is the AI strategy for the new product or rot. Comments don't help; deletion does.
2. It widens the dependency graph (Gemini SDK, kb.json text resource) without a code path that exercises it.
3. It pollutes coverage targeting — the 95% bar in [[adr-0004-coverage-95pct-flat-via-flaui]] applies flat across the solution. Carrying dead code means writing tests for dead code or carving exclusions, both of which are worse than deleting.

The Dota 2 / Gemini design *was* documented in commit `f8f44a4` and beyond; it is recoverable from git history if any of the patterns ever need to be ported.

## Decision

In **Phase 1** of the productionization plan, delete the following files outright:

- `GsiServer.cs`
- `GameState.cs`
- `IGameStateProvider.cs`
- `AiHintService.cs`
- `ContextBuilder.cs`
- `KnowledgeBase.cs`
- `kb.json`
- `Controllers/ProxyController.cs`

Remove their `<Compile>` / `<None>` / `<EmbeddedResource>` includes from the csproj (or rely on SDK-style globbing to pick up the deletions automatically). Drop the related NuGet packages from `Directory.Packages.props` if no other project consumes them (e.g. `Google.Cloud.AIPlatform.V1` or whichever Gemini SDK is in use).

Do **not** wrap any of this code in `#if DOTA_LEGACY` or leave it `[Obsolete]`. The git history is the archive; the live tree is for live code.

## Consequences

**Positive**
- Smaller, less ambiguous codebase. New contributors are not misled by Dota-flavoured types.
- Coverage bar becomes achievable without writing tests for code we don't want.
- Dependency graph shrinks; build is faster.
- The new BG3 ingestion surface ([[adr-0003-bg3-ingestion-mock-plus-lua-skeleton]]) has uncontested ownership of the "game event source" abstraction — no need to coexist with `IGameStateProvider`.

**Negative**
- Anyone who liked the old AI-hint idea must read git history to recover it. Acceptable — git history is the authoritative archive.

**Neutral**
- `MainWindow.xaml.cs` itself is *not* deleted in this ADR; it is restructured into `Views/Overlay/OverlayWindow.xaml.cs` + an extracted `OverlayWindowInterop.cs` during Phase 1. The P/Invoke layered-window setup stays — it is what makes the overlay work and is reused unchanged. Only the *commented-out Dota plumbing* is removed.

## Alternatives considered

- **Keep the files, mark `[Obsolete]`**. Rejected — `[Obsolete]` is for code on a deprecation path that callers must migrate off of. There are no callers. The files are dead today.
- **Move to a `legacy/` folder**. Rejected — moves rot into a folder where it lingers; git history serves the same purpose without the live-tree cost.
- **Port the AI-hint pattern to BG3**. Possible future work, documented in `docs/roadmap.md`. Not a reason to keep the Dota-shaped code: a BG3 hint engine is a new design against a new event schema, not a refactor of this one.

## Verification

After Phase 1:
```powershell
Get-ChildItem -Recurse -Include GsiServer.cs,GameState.cs,IGameStateProvider.cs,AiHintService.cs,ContextBuilder.cs,KnowledgeBase.cs,kb.json,ProxyController.cs |
  Where-Object { $_.FullName -notmatch '\\obj\\' }
# expect: no output
git log --all --oneline -- Overlay-in-game-WPF/GsiServer.cs
# expect: history is preserved
```

## References

- [[adr-0001-monorepo-rename-reyn]] — the rename clears the way for the deletion.
- [[adr-0003-bg3-ingestion-mock-plus-lua-skeleton]] — the replacement event source.
- Plan section "Phase 1 — Monorepo restructure (no behavior change)".
