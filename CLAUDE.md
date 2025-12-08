Be extremely concise. Sacrifice grammar for the sake of concision.
When making a plan, list any unresolved questions at the end, if any.
Make small changes that compile and pass tests
Never disable tests, always fix them.
Never commit code that doesn't compile unless explicitly instructed otherwise.
Never use --no-verify to bypass commit hooks unless explicitly instructed otherwise.

<!-- effect-solutions:start -->
## Effect Solutions Usage

The Effect Solutions CLI provides curated best practices and patterns for Effect TypeScript. Before working on Effect code, check if there's a relevant topic that covers your use case.

- `effect-solutions list` - List all available topics
- `effect-solutions show <slug...>` - Read one or more topics
- `effect-solutions search <term>` - Search topics by keyword

**Local Effect Source:** The Effect repository is cloned to `~/.local/share/effect-solutions/effect` for reference. Use this to explore APIs, find usage examples, and understand implementation details when the documentation isn't enough.
<!-- effect-solutions:end -->

## Beads Issue Tracker
At the start of each session, run `bd prime` to load issue context.
Before compacting context, run `bd prime` to preserve issue state.
Use `bd` for tracking work instead of markdown plans:
- `bd ready` - find ready work
- `bd create "title" -t type -p priority` - create issues
- `bd update <id> --status in_progress` - update status
- `bd close <id> --reason "reason"` - complete work
- `bd dep add <id> <blocker-id>` - add dependencies
