# floai harness engineering catalog

Source inspected: `/home/michaelvessia/projects/floai`.
Target context: `subq` currently uses Effect 3 (`effect@3.18.4`), Bun's native test runner via `@codeforbreakfast/bun-test-effect`, direct oxlint/oxfmt JSON configs, `knip`, no `validate` runner, and vendored `repos/effect` + `repos/effect-atom` without refresh scripts or agent guidance.

## High-value copy candidates

| Area | floai source | What to copy | subq adaptation notes | Priority |
| --- | --- | --- | --- | --- |
| Vendored Effect reference | `repos/effect-smol/`, `package.json` `vendor:update:effect-smol`, `AGENTS.md` Effect section | Use `effect-smol` as read-only API/source reference; tell agents to start at `repos/effect-smol/LLMS.md`, `ai-docs/`, then source. | subq already has `repos/effect`/`repos/effect-atom` subtrees. Either add `repos/effect-smol` or replace old Effect subtree. Add refresh script + editor excludes + “do not import from repos” guidance. | P0 |
| Effect v4 toolchain | `package.json`, `tsconfig.base.json` | `effect@^4 beta`, matching `@effect/*@4 beta`, `@effect/language-service`, `@effect/tsgo`, `@typescript/native-preview`, `postinstall: effect-language-service patch && effect-tsgo patch`, `tsgo --noEmit`. | Migration is invasive: api/shared/web packages depend on Effect 3 platform/rpc/sql packages. Do after reference + tests are ready. | P0/P1 |
| Effect language-service strictness | `tsconfig.base.json` plugin config | Turn nearly all Effect diagnostics into `error`: floating effects, missing error/context, global `Date`/`fetch`/`process.env`, unsafe assertions, service pattern issues, etc. | Current subq only warns one diagnostic. Copy gradually; some web/browser code needs scoped overrides. | P1 |
| @effect/vitest harness | `vitest.base.ts`, root/workspace `vitest.config.ts`, `package.json` test scripts | Replace Bun native tests with Vitest + `@effect/vitest` (`it.effect`, `it.layer`, `assert.*`). Shared base config supports markdown raw imports and faster thread pool. | subq tests use `@codeforbreakfast/bun-test-effect` and `expect`. Migration needed before enabling `no-bare-bun-test` and Effect test ast-grep rules. | P1 |
| Ast-grep Effect rules | `sgconfig.yml`, `rules/effect/*`, `rules/shared/*`, `rule-tests/*` | Static rules for Effect idioms and safety. Best rules: no raw `fetch`, `fs`, `console`, `throw`, `try/catch`, `runPromise`, bare `new Error`, unsafe JSON/casts, manual `_tag`, non-`Effect.fn` helpers, bad Effect tests. | Adjust globs from `apps/**` to `packages/**`; likely start on `packages/api` + `packages/shared`, then evaluate `packages/web`. Keep rule tests. | P1 |
| Fallow dependency audit | `fallow.toml`, `package.json` `fallow`, validate leg | Unused dependency/import-graph audit with `repos/**` ignored and real entry points declared. | subq has `knip`; fallow can complement/replace. Need entries for API main, web app entry, scripts, Vite config, maybe Drizzle scripts. | P1 |
| Quiet parallel validate | `scripts/src/commands/run-checks.ts`, root `validate` script, CI env `FALLOW_BASE` | One command runs `sync-check`, format, lint, typecheck, tests, fallow, ast-grep in parallel; prints one success line or failed legs tailed to 80 lines. | subq has `check` sequential and CI split jobs. Copy concept; legs: format, lint, typecheck, API tests, maybe web e2e optional, fallow, ast-grep. | P1 |
| Agent stop / pretool hooks | `.claude/settings.json`, `.codex/config.toml`, `scripts/hooks/no-bare-bun-test.sh`, `scripts/hooks/stop-checks.sh`, tests | Block `bun test`; on agent stop, run `bun run validate` only if working tree changed; feed failures back to agent. | Best after `validate` and Vitest migration. Tests are worth copying to avoid hook footguns. | P2 |
| Lefthook pre-commit | `lefthook.yml` | Auto-fix staged TS/JS via oxfmt/oxlint, then run full validate; commit-msg commitlint. | Current subq pre-commit runs format/lint/typecheck/test directly. Replace with staged fixes + validate once validate exists. | P2 |
| Ultracite + strict oxlint/oxfmt | `oxlint.config.mjs`, `oxfmt.config.mjs`, `scripts/src/shared/oxlint-boundaries-plugin.js` | Move from JSON configs to JS configs extending Ultracite; stricter `any`, non-null assertion, type assertion bans; boundaries plugin to block relative cross-workspace imports. | subq has React web; merge React rules carefully. Boundary types: `api`, `shared`, `web`, `scripts`; require `@subq/shared` package import across packages. | P2 |
| PR CI validate gate | `.github/workflows/ci.yml` | Pull-request CI: checkout full history for fallow, install frozen lockfile, run `FALLOW_BASE=origin/<base> bun run validate`; separate smoke job + aggregator. | subq currently deploys on push with split checks. Add PR CI before changing deploy flow. Keep Docker smoke separate. | P2 |
| Meta-tests for tooling | `scripts/test/*config*.test.ts`, `no-bare-bun-test.test.ts`, `stop-checks.test.ts`, `oxlint-type-safety.test.ts` | Treat harness rules as code: tests assert hooks/configs/rules really catch intended regressions. | Copy once scripts workspace exists. Valuable for strictness changes. | P2 |
| Scripts workspace discipline | `scripts/package.json`, `scripts/AGENTS.md`, `scripts/src/commands/*` | Dedicated private workspace for repo automation, with own typecheck/test/format and Effect v4 service patterns. | subq has root `scripts/`; consider turning it into a workspace if validate/fallow/repo automation grows. | P2 |
| Agent docs / repo language | `AGENTS.md`, `CONTEXT.md`, `docs/agents/*`, `CONTRIBUTING.md` | Clear layout, nested AGENTS rule, vendored repo rules, focused vs full validation loop, canonical domain language, issue-tracker guidance. | subq AGENTS is sparse and migration-focused. Add layout, validation tiers, Effect reference, and domain/ADR pointers. | P2 |
| Editor excludes for vendored repos | `.vscode/settings.json`, `.zed/settings.json`, `.gitignore` | Exclude `repos/**` from auto-imports, file watchers, search; ignore local agent artifacts (`.scratch`, `.warden`, `.fallow`, `.lefthook-local.yml`). | subq VS Code settings only set TS SDK. Copy exclusions immediately if keeping vendored source. | P0 |
| Commit/PR hygiene | `commitlint.config.js`, `.github/workflows/pr-title.yml`, `.github/PULL_REQUEST_TEMPLATE.md` | Conventional commit PR-title check, self-tested config, PR template focused on intent + validation + agent attribution. | Low-risk copy. Could align with existing personal workflow. | P3 |
| Nix/bun2nix packaging | `flake.nix`, `bun.nix` | Reproducible dev shells, `bun2nix` package build, separate `pr-smoke` shell with `vhs`/`ffmpeg`. | subq flake already provides Bun/Fly/SQLite/Playwright. Add only if Nix package/release artifact needed. | P3 |
| Release/smoke automation | `.github/workflows/release.yml`, `install-smoke.yml`, `plugin-install-smoke.yml`, `pr-smoke-recording.yml` | Release-please, install smoke tests, PR smoke video artifacts. | Mostly flo CLI/plugin-specific. Only copy patterns if subq gains installable CLI/demo flows. | Later |

## Ast-grep rule inventory worth porting

Effect runtime discipline:
- `no-fetch-in-effect`, `no-direct-fs-import`, `no-console-log`, `no-runpromise-in-effect`, `no-throw-in-effect-generator`, `no-try-catch-in-effect`
- `no-bare-new-error`, `use-tagged-error`, `tagged-error-location`
- `prefer-effect-fn`, `no-effect-fn-rewrap`

Data boundary safety:
- `no-json-parse-without-schema`, `no-manual-json-decode`
- `no-unsafe-typecast-at-boundary`, `no-typed-boundary-assignment`
- `no-manual-tag-check`

Test hygiene:
- `no-effect-run-in-tests`, `no-expect-in-it-effect`, `no-it-live`

General style / analyzability:
- `no-dynamic-import`, `no-else-after-return`, `no-foreach`

## Suggested sequencing

1. Low-risk foundation: add `repos/effect-smol` or replace old Effect subtree; update AGENTS/editor excludes; add refresh script.
2. Test foundation: migrate API/shared tests to Vitest + `@effect/vitest`; add root/workspace Vitest configs.
3. Validation foundation: add `validate` runner, PR CI, fallow, and ast-grep in report-only/zero-violation mode.
4. Strictness ratchet: enable Effect language-service diagnostics and stricter oxlint/Ultracite rules.
5. Agent back-pressure: add Claude/Codex hooks and lefthook validate gate.
6. Optional automation: PR-title checks and release/smoke niceties.

## Open decisions

- Keep `repos/effect` + `repos/effect-atom`, or replace with `repos/effect-smol` as the canonical v4 reference?
- Migrate all packages to Effect v4 at once, or API/shared first and web later?
- Should strict Effect ast-grep rules apply to `packages/web`, or only Effect-heavy server/shared surfaces?
- Use Fallow alongside Knip, or replace Knip once fallow coverage is tuned?
