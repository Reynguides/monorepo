# ADR-0010: CI/CD on GitHub Actions; Worker deploys are `workflow_dispatch` only

- **Status**: Accepted — 2026-05-28
- **Deciders**: @delas.oleksandr
- **Supersedes**: n/a
- **Superseded by**: n/a

## Context

The repo has no CI today. Every quality gate established by ADRs 0004 ([[adr-0004-coverage-95pct-flat-via-flaui]]) and 0009 ([[adr-0009-strict-ts-and-net-quality-gates]]) is only meaningful if a hosted runner enforces it on every PR. The repo is private and hosted on GitHub, so GitHub Actions is the path of least friction.

For deploys, the two realistic models are:

- **CD on `main`**: every merge to `main` deploys the Worker. Maximal velocity; minimal safety. A typo'd merge ships.
- **`workflow_dispatch`**: deploys happen when a human triggers the workflow. Slower; one extra click; but every production change has an explicit "yes, ship this commit" moment.

This project has a single developer; the Worker writes to real Cloudflare D1 (per [[adr-0002-per-user-d1-via-rest-api]]); a rogue migration could destroy real users' data. The marginal cost of a button click is dominated by the marginal cost of a mistake.

## Decision

### Workflows

1. **`.github/workflows/ci.yml`** — runs on every PR and every push:
   - Job `dotnet` on `windows-latest`:
     - `actions/setup-dotnet@v4` (channel `8.0.x` from `global.json`).
     - `dotnet restore`, `dotnet build Reyn.sln -warnaserror`.
     - `dotnet test Reyn.sln --settings tools/coverage/coverlet.runsettings /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura /p:Threshold=95`.
     - Upload `coverage/**/*.cobertura.xml` as artefact.
     - ReportGenerator → `coverage/report/Summary.txt`; fail if `Line coverage < 95`.
   - Job `worker` on `ubuntu-latest`:
     - `actions/setup-node@v4` (from `.nvmrc`), `pnpm/action-setup@v4`.
     - `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
     - `pnpm test -- --coverage` with Vitest threshold gate `>=95` lines / functions, `>=90` branches.
   - Job `lua` on `ubuntu-latest`:
     - `apt install lua5.1`, `lua tests/lua/run.lua`.
   - Job `docs` on `ubuntu-latest`:
     - `lychee` against `docs/**/*.md`, `CLAUDE.md`, `README.md`.
     - `cspell "docs/**/*.md" "CLAUDE.md" "README.md"`.
   - Job `secrets-scan` on `ubuntu-latest`:
     - `gitleaks/gitleaks-action@v2`.

   The `dotnet`, `worker`, `lua`, `docs`, and `secrets-scan` jobs run in parallel. The PR cannot be merged unless all five pass.

2. **`.github/workflows/deploy-worker.yml`** — `workflow_dispatch` only:
   - `windows`/`ubuntu` doesn't matter; use `ubuntu-latest`.
   - Inputs: `target` (`production` | `staging`), `confirm_ref` (the commit SHA the operator expects to deploy).
   - Steps: install pnpm, install deps, `wrangler d1 migrations apply reyn_accounts --remote`, `wrangler deploy --env $target`.
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SESSION_PEPPER`, `CF_API_TOKEN` (the per-user D1 provisioning token).
   - Pre-deploy step asserts `git rev-parse HEAD == $confirm_ref` and fails otherwise. Prevents the "I clicked deploy on the wrong branch" mistake.

### What is **not** automated

- Production deploys from `main`. Explicit per-deploy human trigger.
- Tag creation / release notes. Manual until the project has external users.

## Consequences

**Positive**
- Every PR is checked against the full quality bar. Coverage gate, lint, types, secrets, docs — five orthogonal gates.
- Production deploys carry an audit trail (the dispatch event records who clicked and at what SHA).
- The `confirm_ref` input is a small but real check against fat-fingered deploys.

**Negative**
- Windows runners are slower and more expensive than Ubuntu. The `dotnet` job needs Windows because WPF + FlaUI need a real Windows session. We accept the cost.
- Deploys take an extra human step. Acceptable; this is a feature.

**Neutral**
- We do not configure required reviewers because the team is one person. When the team grows, enable branch protection requiring at least one approval before merge.

## Alternatives considered

- **CD on every push to `main`** — rejected for the data-loss-blast-radius reason above.
- **GitLab CI / Buildkite / Circle** — fine; GitHub Actions is on-platform and avoids credential plumbing.
- **Linux .NET build with `dotnet test` skipping UI tests** — defeats the flat-coverage point of [[adr-0004-coverage-95pct-flat-via-flaui]].
- **`act` for local CI runs** — useful for debugging, not a substitute for the hosted runner. Recommended but not required.

## Verification

After Phase 11:
- Open a draft PR with a trivial change. All five required jobs run. Merging is blocked until they pass.
- Trigger `Deploy Worker → staging` from the Actions UI; confirm `wrangler deploy --env staging` runs and the dashboard reflects the new version.

## References

- GitHub Actions `workflow_dispatch`: <https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch>
- Coverlet `Threshold` mode: <https://github.com/coverlet-coverage/coverlet/blob/master/Documentation/MSBuildIntegration.md#coverage-thresholds>
- [[adr-0004-coverage-95pct-flat-via-flaui]], [[adr-0009-strict-ts-and-net-quality-gates]] — the gates this workflow enforces.
- [[adr-0002-per-user-d1-via-rest-api]] — the reason production deploys carry user-data risk.
