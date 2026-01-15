Be extremely concise. Sacrifice grammar for the sake of concision.
When making a plan, list any unresolved questions at the end, if any.
Make small changes that compile and pass tests
Never disable tests, always fix them.
Never commit code that doesn't compile unless explicitly instructed otherwise.
Never use --no-verify to bypass commit hooks unless explicitly instructed otherwise.

## Database Migrations

When creating a new migration file in `packages/api/drizzle/`:
1. Create the SQL file (e.g., `0010_my_migration.sql`)
2. **Add an entry to `packages/api/drizzle/meta/_journal.json`** - migrations won't run without this!
3. Test locally with `cd packages/api && bun run scripts/migrate.ts`

<!-- effect-solutions:start -->
## Effect Solutions Usage

The Effect Solutions CLI provides curated best practices and patterns for Effect TypeScript. Before working on Effect code, check if there's a relevant topic that covers your use case.

- `effect-solutions list` - List all available topics
- `effect-solutions show <slug...>` - Read one or more topics
- `effect-solutions search <term>` - Search topics by keyword

**Local Effect Source:** The Effect repository is cloned to `~/.local/share/effect-solutions/effect` for reference. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.
<!-- effect-solutions:end -->