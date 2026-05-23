Be extremely concise. Sacrifice grammar for the sake of concision.
When making a plan, list any unresolved questions at the end, if any.
Make small changes that compile and pass tests
Never disable tests, always fix them.
Never commit code that doesn't compile unless explicitly instructed otherwise.
Never use --no-verify to bypass commit hooks unless explicitly instructed otherwise.

## Repo Layout

- `packages/api` - Bun/Effect API, Drizzle migrations, server tests.
- `packages/shared` - shared schemas/types/RPC contracts.
- `packages/web` - Vite/React frontend and Playwright e2e tests.
- `scripts` - repo-local automation scripts.
- `repos` - vendored upstream source for reference only.

## Vendored Source

`repos/` contains read-only upstream source. Do not edit files under `repos/` and do not import from `repos/` in app code. Use vendored source only to verify upstream APIs and patterns when local docs or package typings are insufficient.

Current vendored references include Effect, Effect Atom, and TanStack Router sources. If adding/updating a vendored repo, prefer a squashed `git subtree` under `repos/<name>` plus a root package script documenting the refresh command.

## Database Migrations

When creating a new migration file in `packages/api/drizzle/`:
1. Create the SQL file (e.g., `0010_my_migration.sql`)
2. **Add an entry to `packages/api/drizzle/meta/_journal.json`** - migrations won't run without this!
3. Test locally with `cd packages/api && bun run scripts/migrate.ts`
