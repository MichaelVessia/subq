# Autoresearch: Effect v4 + floai harness migration

## Objective

Complete the harness migration described in `docs/floai-harness-catalog.md`, explicitly excluding Warden. End state:

- `bun run validate` exists and passes.
- Repo is fully migrated to Effect v4-compatible packages and test tooling.
- Old `repos/effect` v3 subtree is gone; `repos/effect-smol` is the canonical read-only Effect v4 reference.
- floai-style harness pieces are copied/adapted: Vitest + `@effect/vitest`, ast-grep rules, fallow, strict validation runner, editor excludes, agent docs/hooks, lefthook/CI, PR hygiene where applicable.

## Metrics

- **Primary**: `failing_checks` (count, lower is better) — number of real repo validation/migration gates failing in `./autoresearch.sh`.
- **Secondary**: individual gate pass/fail state printed by the script; wall time captured by autoresearch tooling.

`failing_checks=0` means the migration target is reached.

## How to Run

`./autoresearch.sh`

The script runs real checks/gates and prints `METRIC failing_checks=<n>`. It must not be gamed. Do not weaken checks to improve the metric; fix the repo.

## Files in Scope

- `package.json`, `bun.lock` — dependency/tooling migration and scripts.
- `tsconfig*.json`, package tsconfigs — Effect v4 / tsgo / language-service settings.
- `packages/**` — code/test migration from Effect v3 to v4.
- `scripts/**` — validate runner, hooks, repo automation workspace if needed.
- `rules/**`, `rule-tests/**`, `sgconfig.yml` — ast-grep rules and tests.
- `fallow.toml`, `knip.json` — dependency/import-graph checks.
- `lefthook.yml`, `.github/workflows/**`, `.claude/**`, `.codex/**` — local/CI/agent harness.
- `AGENTS.md`, `CLAUDE.md`, `.vscode/**`, `.zed/**`, `.gitignore`, docs under `docs/**`.
- `repos/**` only for removing old v3 subtree and adding/updating read-only upstream subtrees.

## Off Limits

- Do not add Warden (`warden.toml`, `.github/workflows/warden.yml`, Warden skills).
- Do not cheat by changing `autoresearch.sh` or `bun run validate` to skip required checks.
- Do not disable or delete tests to pass validation; migrate/fix them.
- Do not import from `repos/**` in app code.
- Do not edit vendored source by hand; use subtree operations or replace whole vendored directories intentionally.

## Constraints

- Keep changes small enough to understand; each kept experiment should reduce real failing gates or enable the next reduction.
- Prefer floai patterns, adapted to subq (`packages/api`, `packages/shared`, `packages/web`).
- Use Effect v4 source in `repos/effect-smol` for API verification.
- The final validation command is `bun run validate`.

## What's Been Tried

- Initial investigation cataloged floai harness candidates in `docs/floai-harness-catalog.md` and removed Warden from the plan.
- P0 low-risk edits started: editor excludes for `repos/**`, local artifact ignores, and vendored-source guidance in AGENTS/CLAUDE.
