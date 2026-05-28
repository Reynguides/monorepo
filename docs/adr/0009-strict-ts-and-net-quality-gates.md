# ADR-0009: Strict TypeScript and strict .NET quality gates enforced in CI

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The repo today has none of the standard quality-gate scaffolding: no `Directory.Build.props`, no analyzers enabled, no `.editorconfig`, no nullable enforcement, no warnings-as-errors. The TypeScript side does not exist yet but will be a full Worker, a TS event catalog, and shared types — three places where a loose `tsconfig` would cost us real correctness.

The user has asked for **production-grade** quality. We need the gate decisions captured now because retrofitting strict mode onto an already-loose codebase is much more expensive than starting strict.

The 95% coverage gate already lives in [[adr-0004-coverage-95pct-flat-via-flaui]]. This ADR covers the *non-coverage* quality bars: type strictness, analyzer rules, lint rules, file/function size limits, format checks.

## Decision

### .NET — `Directory.Build.props` applies to every project in `Reyn.sln`

```xml
<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <LangVersion>latest</LangVersion>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <WarningsAsErrors />                       <!-- promotes ALL warnings -->
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <GenerateDocumentationFile>true</GenerateDocumentationFile>
    <NoWarn>$(NoWarn);CS1591</NoWarn>           <!-- explicit, justified opt-outs only -->
  </PropertyGroup>
</Project>
```

Analyzers (`Directory.Packages.props`, applied via `Directory.Build.props`):
- `Microsoft.CodeAnalysis.NetAnalyzers` (latest)
- `StyleCop.Analyzers`
- `Roslynator.Analyzers`

`.editorconfig` carries the per-rule severity. `#pragma warning disable` without a justification comment on the same line is rejected by a custom analyzer rule.

### TypeScript — `tsconfig.json` strict suite

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```

### TypeScript — flat ESLint config, *error* (not warn) for:

- `@typescript-eslint/no-explicit-any`
- `@typescript-eslint/no-unsafe-assignment`, `…/no-unsafe-call`, `…/no-unsafe-return`, `…/no-unsafe-member-access`
- `@typescript-eslint/no-floating-promises`
- `@typescript-eslint/consistent-type-imports`
- `no-nested-ternary`
- `no-restricted-syntax` blocking `as unknown as X` casts
- `complexity` ≤ 10
- `max-lines` ≤ 300 (per file)
- `max-lines-per-function` ≤ 60 (excluding blank lines)
- `import/no-duplicates`

Prettier handles format; `pnpm format:check` runs in CI.

### Validation at boundaries

- Every HTTP request body and response payload in the Worker is parsed by a **Zod schema** before it reaches handler logic. No `req.json() as MyType` shortcuts.
- Every D1 row that crosses the Worker→handler boundary passes through a Zod schema (one per table).
- Casts: `as` is reserved for narrowing after a Zod parse. `as unknown as X` is banned by ESLint.

## Consequences

**Positive**
- The build *cannot* land with warnings, untyped boundaries, ESLint errors, or untouched dead code (`@typescript-eslint/no-unused-vars` is on).
- The 300-line / 60-line caps are not stylistic — they are a forcing function: when a file or function approaches the cap, the right move is decomposition, and the cap surfaces that need early.
- New contributors learn the rules from the build, not from a wiki page.

**Negative**
- Slower local edit-build cycles because analyzers do more work. We accept this. Use `Directory.Build.props` toggle `<RunAnalyzersDuringBuild>false</RunAnalyzersDuringBuild>` for very tight inner loops, but CI always runs them.
- A few legitimate cases (e.g. a 70-line switch over the event catalog) will hit `max-lines-per-function`. Acceptable: refactor into a table-driven dispatch.
- StyleCop has its own opinions (file headers, ordering). We *don't* enable the noisy SA1xxx rules around file headers; documented in `.editorconfig` overrides.

**Neutral**
- The C# `WarningsAsErrors` empty value (which means "all warnings") plus `NoWarn` for documentation-on-public-API (`CS1591`) is the standard pragmatic compromise.

## Alternatives considered

- **Use defaults, gate only on `dotnet build` succeeding**. The de-facto industry default; gives you almost nothing. Rejected.
- **`AnalysisLevel=preview`**. Too noisy for a small team; `latest-recommended` is the right shelf.
- **Biome instead of ESLint + Prettier**. Faster but missing some ESLint plugins we want (`@typescript-eslint/no-floating-promises` parity, `import/no-duplicates`). Re-evaluate at Phase 11.
- **No size caps**. Caps are a hot debate; we accept them because every long function in this codebase tends to grow into a god-object over time, and we'd rather refactor at 60 lines than at 600.

## Verification

CI gates per [[adr-0010-ci-cd-github-actions]]:
- `.NET` job: `dotnet build Reyn.sln -warnaserror` must succeed.
- `Worker` job: `pnpm typecheck && pnpm lint && pnpm format:check` must succeed.
- `secrets-scan` job: `gitleaks` against the diff.
- `docs` job: `lychee` for broken Markdown links; `cspell` for spelling.

## References

- Microsoft .NET analyzer rules: <https://learn.microsoft.com/dotnet/fundamentals/code-analysis/code-quality-rule-options>
- typescript-eslint recommended-type-checked: <https://typescript-eslint.io/users/configs/#recommended-type-checked>
- [[adr-0004-coverage-95pct-flat-via-flaui]] — the coverage half of the quality bar.
- [[adr-0010-ci-cd-github-actions]] — where these gates run.
