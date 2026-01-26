# Local-First TUI/CLI with Background Sync

## Problem

TUI and CLI feel wrong making network requests at runtime. Authentication dance and network latency don't belong in terminal tools.

## Solution

TUI/CLI read/write to local SQLite. Background sync pushes/pulls to server. Web continues using server directly.

```
┌─────────┐     ┌─────────────────┐     ┌─────────┐
│   Web   │────▶│  Server + DB    │◀────│  Sync   │
└─────────┘     └─────────────────┘     └────┬────┘
                                             │
                      ┌──────────────────────┘
                      ▼
               ┌─────────────┐
               │ ~/.subq/    │
               │  data.db    │
               │  config     │
               └──────┬──────┘
                      │
              ┌───────┴───────┐
              ▼               ▼
         ┌─────────┐     ┌─────────┐
         │   TUI   │     │   CLI   │
         └─────────┘     └─────────┘
```

## Local Storage

```
~/.subq/
  data.db       # SQLite database (mirrors server schema)
  config.json   # auth token, server URL, sync cursor
```

### config.json

```json
{
  "server_url": "https://subq.vessia.net",
  "auth_token": "sk_...",
  "last_sync_cursor": "2024-01-15T10:30:00Z"
}
```

File permissions: `chmod 600` on creation (owner read/write only).

## Sync Scope

**Tables that sync** (all user data):
- `weight_logs`
- `injection_logs`
- `glp1_inventory`
- `injection_schedules`
- `schedule_phases`
- `user_goals`
- `user_settings`

**Tables that don't sync** (auth is server-side only):
- `user`
- `session`
- `account`
- `verification`

## Database Schema Additions

Schema shared between server and local via `packages/api/src/db/schema.ts`.

### Sync columns on all synced tables

```sql
ALTER TABLE weight_logs ADD COLUMN deleted_at TEXT;  -- ISO8601, soft delete for sync
-- (updated_at already exists on all tables)
-- (id is already UUID, reused for sync identification)

-- Same for: injection_logs, glp1_inventory, injection_schedules, schedule_phases, user_goals, user_settings
```

### Outbox table (local only)

```sql
CREATE TABLE sync_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,           -- UUID of the affected row
  operation TEXT NOT NULL,        -- 'insert' | 'update' | 'delete'
  payload TEXT NOT NULL,          -- JSON snapshot of the row
  timestamp INTEGER NOT NULL,     -- Unix ms when change was made
  created_at TEXT NOT NULL
);
```

### Sync metadata table (local only)

```sql
CREATE TABLE sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Error Types

Domain-specific errors using `Schema.TaggedError` for type-safe handling:

```typescript
// Sync errors
class SyncNetworkError extends Schema.TaggedError<SyncNetworkError>()(
  "SyncNetworkError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  }
) {}

class SyncAuthError extends Schema.TaggedError<SyncAuthError>()(
  "SyncAuthError",
  {
    message: Schema.String,
  }
) {}

class SyncConflictError extends Schema.TaggedError<SyncConflictError>()(
  "SyncConflictError",
  {
    conflicts: Schema.Array(Schema.Struct({
      id: Schema.String,
      serverVersion: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
    })),
    message: Schema.String,
  }
) {}

// Auth errors
class InvalidTokenError extends Schema.TaggedError<InvalidTokenError>()(
  "InvalidTokenError",
  {
    message: Schema.String,
  }
) {}

class LoginFailedError extends Schema.TaggedError<LoginFailedError>()(
  "LoginFailedError",
  {
    reason: Schema.Literal("invalid_credentials", "account_locked", "network_error"),
    message: Schema.String,
  }
) {}

// Local DB errors
class SchemaVersionError extends Schema.TaggedError<SchemaVersionError>()(
  "SchemaVersionError",
  {
    localVersion: Schema.String,
    requiredVersion: Schema.String,
    message: Schema.String,
  }
) {}

type SyncError = SyncNetworkError | SyncAuthError | SyncConflictError
```

## Sync Protocol

### Schemas

```typescript
// Shared change schema
const SyncChange = Schema.Struct({
  table: Schema.String,
  id: Schema.String,
  operation: Schema.Literal("insert", "update", "delete"),
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  timestamp: Schema.Number,
})

const SyncConflict = Schema.Struct({
  id: Schema.String,
  serverVersion: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
})
```

### Push (local -> server)

```typescript
const PushRequest = Schema.Struct({
  changes: Schema.Array(SyncChange),
})

const PushResponse = Schema.Struct({
  accepted: Schema.Array(Schema.String),
  conflicts: Schema.Array(SyncConflict),
})
```

### Pull (server -> local)

```typescript
const PullRequest = Schema.Struct({
  cursor: Schema.String,
  limit: Schema.optional(Schema.Number),
})

const PullResponse = Schema.Struct({
  changes: Schema.Array(SyncChange),
  cursor: Schema.String,
  hasMore: Schema.Boolean,
})
```

### Batch Limits

- Max 1000 changes per push/pull request
- Client pages through if more pending
- Initial sync uses pagination with progress feedback

## Conflict Resolution

**Strategy**: Server wins, row-level timestamp comparison.

### Conflict Detection Logic

For each pushed change:
1. Server checks if `row.updated_at > change.timestamp`
2. If yes: conflict. Server rejects, returns current server version.
3. If no: accept the change.

### Resolution Flow

1. Push local changes
2. Server rejects conflicts, returns server versions
3. Client overwrites local with server version (silent overwrite, no notification)
4. Removes conflicted entries from outbox

For single-user across devices, conflicts are rare. Web edits take precedence over offline TUI/CLI edits.

## Soft Deletes

Server migrates from hard deletes to soft deletes:

1. Add `deleted_at` column to all synced tables
2. Queries filter out `WHERE deleted_at IS NULL`
3. Sync propagates deletions via `deleted_at` timestamp
4. Soft-deleted rows kept forever (no periodic purge)

### Cascade Soft Deletes

When `injection_schedules` is soft-deleted, its `schedule_phases` are also soft-deleted (application logic, not DB trigger).

## Services

### LocalDb Service

```typescript
class LocalDb extends Effect.Service<LocalDb>()("LocalDb", {
  effect: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    return {
      getMeta: Effect.fn("LocalDb.getMeta")(
        (key: string): Effect.Effect<Option.Option<string>> =>
          sql`SELECT value FROM sync_meta WHERE key = ${key}`.pipe(
            SqlSchema.findOne(Schema.Struct({ value: Schema.String })),
            Effect.map(Option.map((r) => r.value))
          )
      ),

      setMeta: Effect.fn("LocalDb.setMeta")(
        (key: string, value: string): Effect.Effect<void> =>
          sql`INSERT OR REPLACE INTO sync_meta (key, value) VALUES (${key}, ${value})`.pipe(
            SqlSchema.void
          )
      ),

      getOutbox: Effect.fn("LocalDb.getOutbox")(
        (options: { limit: number }): Effect.Effect<Array<typeof SyncChange.Type>> =>
          sql`SELECT * FROM sync_outbox ORDER BY id LIMIT ${options.limit}`.pipe(
            SqlSchema.findAll(SyncChange)
          )
      ),

      clearOutbox: Effect.fn("LocalDb.clearOutbox")(
        (ids: ReadonlyArray<string>): Effect.Effect<void> =>
          sql`DELETE FROM sync_outbox WHERE row_id IN ${ids}`.pipe(SqlSchema.void)
      ),

      applyChanges: Effect.fn("LocalDb.applyChanges")(
        (changes: ReadonlyArray<typeof SyncChange.Type>): Effect.Effect<void> =>
          Effect.forEach(changes, applyChange, { discard: true })
      ),

      applyServerVersion: Effect.fn("LocalDb.applyServerVersion")(
        (conflict: typeof SyncConflict.Type): Effect.Effect<void> =>
          /* upsert logic */
      ),

      removeFromOutbox: Effect.fn("LocalDb.removeFromOutbox")(
        (id: string): Effect.Effect<void> =>
          sql`DELETE FROM sync_outbox WHERE row_id = ${id}`.pipe(SqlSchema.void)
      ),
    }
  }),
}) {}
```

### LocalConfig Service

```typescript
class LocalConfig extends Effect.Service<LocalConfig>()("LocalConfig", {
  effect: Effect.gen(function* () {
    const configPath = "~/.subq/config.json"

    return {
      get: Effect.fn("LocalConfig.get")(
        <K extends keyof ConfigSchema>(key: K): Effect.Effect<Option.Option<ConfigSchema[K]>> =>
          /* read JSON, return Option */
      ),

      set: Effect.fn("LocalConfig.set")(
        <K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]): Effect.Effect<void> =>
          /* read, merge, write JSON */
      ),

      getServerUrl: Effect.fn("LocalConfig.getServerUrl")(
        (): Effect.Effect<string> =>
          /* return server_url or default */
      ),

      getAuthToken: Effect.fn("LocalConfig.getAuthToken")(
        (): Effect.Effect<Option.Option<string>> =>
          /* return auth_token */
      ),
    }
  }),
}) {}
```

### RemoteClient Service

```typescript
class RemoteClient extends Effect.Service<RemoteClient>()("RemoteClient", {
  dependencies: [LocalConfig.Default],
  effect: Effect.gen(function* () {
    const config = yield* LocalConfig

    return {
      pull: Effect.fn("RemoteClient.pull")(
        (request: typeof PullRequest.Type): Effect.Effect<typeof PullResponse.Type, SyncNetworkError | SyncAuthError> =>
          /* RPC call with Schema.decodeUnknown(PullResponse) */
      ),

      push: Effect.fn("RemoteClient.push")(
        (request: typeof PushRequest.Type): Effect.Effect<typeof PushResponse.Type, SyncNetworkError | SyncAuthError> =>
          /* RPC call with Schema.decodeUnknown(PushResponse) */
      ),

      authenticate: Effect.fn("RemoteClient.authenticate")(
        (request: typeof AuthRequest.Type): Effect.Effect<typeof AuthResponse.Type, LoginFailedError> =>
          /* RPC call */
      ),
    }
  }),
}) {}
```

## Sync Flow

```typescript
const sync = Effect.fn("Sync.run")(
  (): Effect.Effect<void, SyncError, LocalDb | RemoteClient | SqlClient.SqlClient> =>
    Effect.gen(function* () {
      const local = yield* LocalDb
      const remote = yield* RemoteClient
      const sql = yield* SqlClient.SqlClient

      // Wrap in transaction for atomicity
      yield* sql.withTransaction(
        Effect.gen(function* () {
          // 1. Pull first (get server state)
          let cursor = yield* local.getMeta("last_sync_cursor").pipe(
            Effect.map(Option.getOrElse(() => "1970-01-01T00:00:00Z"))
          )
          let hasMore = true

          while (hasMore) {
            const pulled = yield* remote.pull({ cursor, limit: 1000 })
            yield* local.applyChanges(pulled.changes)
            cursor = pulled.cursor
            hasMore = pulled.hasMore
          }
          yield* local.setMeta("last_sync_cursor", cursor)

          // 2. Push local changes (in batches of 1000)
          let outbox = yield* local.getOutbox({ limit: 1000 })
          while (outbox.length > 0) {
            const result = yield* remote.push({ changes: outbox })

            // Clear accepted from outbox
            yield* local.clearOutbox(result.accepted)

            // Apply server versions for conflicts (silent overwrite)
            yield* Effect.forEach(result.conflicts, (conflict) =>
              Effect.all([
                local.applyServerVersion(conflict),
                local.removeFromOutbox(conflict.id),
              ], { discard: true })
            , { discard: true })

            outbox = yield* local.getOutbox({ limit: 1000 })
          }
        })
      )
    })
)
```

### Atomicity

Sync wrapped in SQLite transaction. If network fails mid-sync, transaction rolls back. No partial state. Retry on next sync cycle.

## Foreign Key Handling

`injection_logs.schedule_id` references `injection_schedules.id`. During sync, if referenced schedule hasn't synced yet:

- FK is nullable, so temporarily null is acceptable
- Next sync will pull the missing schedule
- No FK constraint issues during sync

## TUI Lifecycle

```typescript
// Helper to handle sync errors with structured logging
const handleSyncError = (context: string) =>
  Effect.catchTags({
    SyncNetworkError: (e) =>
      Effect.logWarning("Sync failed: network error").pipe(
        Effect.annotateLogs({ context, message: e.message })
      ),
    SyncAuthError: (e) =>
      Effect.logWarning("Sync failed: auth error").pipe(
        Effect.annotateLogs({ context, message: e.message })
      ),
    SyncConflictError: (e) =>
      Effect.logWarning("Sync failed: conflict error").pipe(
        Effect.annotateLogs({ context, conflictCount: e.conflicts.length })
      ),
  })

const runTui = Effect.gen(function* () {
  // 1. Sync on launch
  yield* sync().pipe(handleSyncError("initial"))

  // 2. Background sync every 30s
  const syncFiber = yield* sync().pipe(
    handleSyncError("background"),
    Effect.repeat(Schedule.spaced("30 seconds")),
    Effect.forkDaemon
  )

  // 3. Run TUI (reads from local DB)
  yield* tui

  // 4. Sync on exit
  yield* Fiber.interrupt(syncFiber)
  yield* sync()
})

const main = runTui.pipe(
  Effect.onInterrupt(() =>
    Effect.logInfo("Syncing before exit...").pipe(
      Effect.andThen(sync()),
      Effect.timeout("5 seconds"),
      handleSyncError("shutdown"),
      Effect.catchAllDefect(() =>
        Effect.logWarning("Sync timed out, will retry next launch")
      )
    )
  )
)
```

### Status Bar

TUI displays sync status with states:
- `syncing` - sync in progress
- `synced (X ago)` - last successful sync timestamp
- `offline` - network unavailable
- `error` - sync failed (details in logs only)

30s staleness acceptable for single-user app.

## CLI Commands

```bash
subq login              # Exchange credentials for token, full sync
subq logout             # Remove token, wipe local data
subq sync               # Manual sync with progress output
subq status             # Show pending change count, last sync time
subq log <dose>         # Log injection (writes to local db + outbox, returns immediately)
subq weight <kg>        # Log weight
```

### CLI Write Behavior

Commands like `subq log` write to local DB + outbox immediately, then return. No network call. Data syncs on next background cycle or manual `subq sync`.

### Manual Sync Output

```
$ subq sync
Pulling... 50 changes
Pushing... 3 changes
Done.
```

## Authentication

### Login Flow

```typescript
const login = Effect.fn("Login.run")(
  (): Effect.Effect<void, LoginFailedError | SyncError, RemoteClient | LocalDb | LocalConfig> =>
    Effect.gen(function* () {
      const remote = yield* RemoteClient
      const config = yield* LocalConfig

      const email = yield* prompt("Email: ")
      const password = yield* prompt("Password: ", { hidden: true })
      const deviceName = yield* getHostname()  // Auto from machine hostname

      // Exchange for CLI token
      const { token } = yield* remote.authenticate({ email, password, deviceName })

      // Store locally with restricted permissions
      yield* config.set("auth_token", token)
      yield* ensureFilePermissions("~/.subq/config.json", 0o600)

      // Initial full sync (paginated with progress)
      yield* fullSyncWithProgress()
    })
)
```

### First Run Requirement

User must run `subq login` before any other command. Commands fail with "Please run `subq login` first" if no token present. No orphan writes allowed.

### CLI Tokens

- Stored in `session` table with `type: 'cli'` column
- Never expire (until explicitly revoked)
- `device_name` column stores hostname
- `last_used_at` updated on each sync

### Token Management (Web UI)

Settings page shows:
- List of CLI tokens: device name, last used date
- "Revoke" button per token
- "Revoke All CLI Tokens" button

### Logout Behavior

`subq logout`:
1. Removes token from config
2. Deletes `~/.subq/data.db`
3. Clean slate for next login

## Server Changes

### New Session Table Columns

```sql
ALTER TABLE session ADD COLUMN type TEXT DEFAULT 'web';  -- 'web' | 'cli'
ALTER TABLE session ADD COLUMN device_name TEXT;
ALTER TABLE session ADD COLUMN last_used_at TEXT;
```

### Sync Middleware

Separate middleware for sync endpoints (not reusing web auth):

```typescript
const cliAuthMiddleware = Effect.fn("CliAuth.validate")(
  (): Effect.Effect<UserId, InvalidTokenError, SqlClient.SqlClient | Clock.Clock> =>
    Effect.gen(function* () {
      const token = yield* getAuthHeader()
      const sql = yield* SqlClient.SqlClient
      const clock = yield* Clock.Clock

      const session = yield* sql`
        SELECT user_id, id FROM session
        WHERE token = ${token}
          AND type = 'cli'
          AND expires_at IS NULL
      `.pipe(
        SqlSchema.findOne(Schema.Struct({
          user_id: UserId,
          id: SessionId,
        }))
      )

      if (Option.isNone(session)) {
        yield* Effect.fail(new InvalidTokenError({ message: "Invalid CLI token" }))
      }

      // Update last used timestamp
      const now = yield* clock.currentTimeMillis
      yield* sql`
        UPDATE session SET last_used_at = ${new Date(now).toISOString()}
        WHERE id = ${session.value.id}
      `.pipe(SqlSchema.void)

      return session.value.user_id
    })
)
```

### RPC Endpoints

```typescript
// packages/rpc/src/contracts/sync.ts

const AuthRequest = Schema.Struct({
  email: Schema.String,
  password: Schema.String,
  deviceName: Schema.String,
})

const AuthResponse = Schema.Struct({
  token: Schema.String,
})

export const SyncRpcs = Rpc.make({
  pull: {
    request: PullRequest,
    response: PullResponse,
    error: Schema.Union(SyncNetworkError, SyncAuthError),
  },
  push: {
    request: PushRequest,
    response: PushResponse,
    error: Schema.Union(SyncNetworkError, SyncAuthError),
  },
  authenticate: {
    request: AuthRequest,
    response: AuthResponse,
    error: LoginFailedError,
  },
})
```

## Schema Migrations

### Server Migrations

Handled via existing Drizzle migrations in `packages/api/drizzle/`.

### Local Migrations

Shared with server. On CLI/TUI startup:

1. Check `sync_meta` for `schema_version`
2. Compare against embedded version in CLI/TUI binary
3. Run any pending migrations
4. If schema incompatible (major version mismatch), prompt user to update CLI/TUI

```typescript
const ensureSchema = Effect.fn("Schema.ensure")(
  (): Effect.Effect<void, SchemaVersionError, LocalDb> =>
    Effect.gen(function* () {
      const local = yield* LocalDb
      const localVersion = yield* local.getMeta("schema_version").pipe(
        Effect.map(Option.getOrElse(() => "0"))
      )
      const requiredVersion = EMBEDDED_SCHEMA_VERSION

      if (localVersion < requiredVersion) {
        yield* runMigrations(localVersion, requiredVersion)
        yield* local.setMeta("schema_version", requiredVersion)
      } else if (localVersion > requiredVersion) {
        yield* Effect.fail(new SchemaVersionError({
          localVersion,
          requiredVersion,
          message: "Please update CLI: your local DB is newer than this version supports",
        }))
      }
    })
)
```

### Corruption Recovery

If local SQLite corrupted:
1. Delete `~/.subq/data.db`
2. Re-run full sync from server
3. Unsynced changes are lost (accepted risk)

## Migration Path

1. Add `deleted_at` column to server tables
2. Add `type`, `device_name`, `last_used_at` columns to `session` table
3. Implement server sync endpoints with CLI auth middleware
4. Create `@subq/local` package:
   - `errors.ts` - Schema.TaggedError definitions (SyncNetworkError, etc.)
   - `schemas.ts` - Schema definitions (SyncChange, PullRequest, etc.)
   - `services/LocalDb.ts` - Effect.Service for SQLite operations
   - `services/LocalConfig.ts` - Effect.Service for config.json
   - `services/RemoteClient.ts` - Effect.Service for RPC calls
   - `sync.ts` - Sync flow using services
   - `migrations.ts` - Schema version management
5. Add sync_outbox and sync_meta tables to local schema
6. Refactor TUI to use local services instead of RPC
7. Add sync to TUI lifecycle with status bar
8. Refactor CLI similarly
9. Add login/logout/sync/status commands
10. Add CLI token management to web UI settings

## Package Structure

```
packages/
  api/
    src/db/
      schema.ts       # SHARED: Drizzle schema (imported by local)
    drizzle/          # Server migrations (shared with local)
  local/              # NEW: local database operations
    src/
      services/
        LocalDb.ts      # LocalDb Effect.Service (SQLite operations)
        LocalConfig.ts  # LocalConfig Effect.Service (config.json)
        RemoteClient.ts # RemoteClient Effect.Service (RPC calls)
      errors.ts         # Schema.TaggedError definitions
      schemas.ts        # SyncChange, PullRequest, etc.
      sync.ts           # Sync flow (uses services)
      migrations.ts     # Schema version management
  tui/
    src/
      index.ts        # Updated to use local services + sync + status bar
  cli/
    src/
      index.ts        # Updated to use local services + sync
      commands/
        login.ts      # NEW
        logout.ts     # NEW
        sync.ts       # NEW
        status.ts     # NEW
```

## Testing

### Unit Tests

- Sync logic with mocked server responses
- Conflict resolution scenarios
- Outbox operations
- Transaction rollback on failure

### Integration Tests

- Full sync flow with real local DB + test server
- Login/logout lifecycle
- CLI commands end-to-end

## Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Error types | Schema.TaggedError | Type-safe handling with catchTag |
| Logging | Effect.logWarning/Info | Structured, observable |
| Services | Effect.Service | Auto-tracing, dependency declaration |
| Method tracing | Effect.fn | Automatic spans for observability |
| Schemas | Schema.Struct | Validated at boundaries |
| Transactions | sql.withTransaction | Effect-SQL pattern |
| Time | Clock service | Testable, deterministic |
| Sync scope | All user data tables | Simpler than allowlist |
| Conflict detection | Row-level timestamp comparison | Accurate without base_timestamp complexity |
| Conflict resolution | Server wins, silent overwrite | Single-user, web edits take precedence |
| Batch size | 1000 changes | Reasonable limit with pagination |
| Clock skew | Ignore | Assume clocks close enough |
| First run | Block until login + sync | No orphan writes |
| Token expiry | Never | Best UX, explicit revoke option |
| Token storage | Extend session table | Reuse existing structure |
| Soft deletes | Server-side | Required for sync propagation |
| Soft delete cleanup | Never purge | Disk space cheap, simplest |
| Staleness | 30s acceptable | Single-user app |
| CLI writes | Write and return | Fast UX, background sync |
| Schema migrations | Shared with server | Single source of truth |
| Local migrations | Embedded in CLI/TUI | Runs on startup |
| Logout | Wipe local data | Clean slate for re-login |
| Accounts | Single account | Simplest |
| Sync atomicity | Transaction rollback | No partial state on failure |
| FK handling | Nullable FKs | Temporary null until next sync |
| Cascade deletes | Soft delete phases | Consistent pattern |
| Status bar | Basic states | syncing, synced, offline, error |
| Config format | JSON | Native to JS, simplest |
| Sync auth | Separate middleware | Cleaner separation |
| Outbox durability | SQLite transaction | Survives crash |
| Device tracking | Don't track | User doesn't care about origin |
| Corruption recovery | Wipe and re-sync | Loses unsynced, accepted risk |
