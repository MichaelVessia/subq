/**
 * Schema Version Management
 *
 * Manages local database schema versioning and migrations.
 * On CLI/TUI startup:
 * 1. Check sync_meta for schema_version
 * 2. Compare against EMBEDDED_SCHEMA_VERSION
 * 3. Run pending migrations if local < required
 * 4. Fail if local > required (CLI needs update)
 */
import { SchemaVersionError } from '@subq/shared'
import { Effect, Option, Order } from 'effect'
import { LocalDb } from './services/LocalDb.js'

// ============================================
// Schema Version Constants
// ============================================

/**
 * Current schema version embedded in the CLI/TUI binary.
 * Format: semantic version string (e.g., "1.0.0", "1.1.0")
 * Increment when schema changes require migrations.
 */
export const EMBEDDED_SCHEMA_VERSION = '1.0.0'

// ============================================
// Semver Comparison
// ============================================

/**
 * Parse a semver string into components.
 * Returns null if invalid format.
 */
const parseSemver = (version: string): { major: number; minor: number; patch: number } | null => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * Order for semver comparison.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
const semverOrder: Order.Order<string> = Order.make((a, b) => {
  const parsedA = parseSemver(a)
  const parsedB = parseSemver(b)

  // Treat unparseable versions as "0.0.0"
  const aVer = parsedA ?? { major: 0, minor: 0, patch: 0 }
  const bVer = parsedB ?? { major: 0, minor: 0, patch: 0 }

  if (aVer.major !== bVer.major) {
    return aVer.major < bVer.major ? -1 : 1
  }
  if (aVer.minor !== bVer.minor) {
    return aVer.minor < bVer.minor ? -1 : 1
  }
  if (aVer.patch !== bVer.patch) {
    return aVer.patch < bVer.patch ? -1 : 1
  }
  return 0
})

// ============================================
// Migration Runner
// ============================================

/**
 * Run migrations from one version to another.
 * Currently a no-op since we're at version 1.0.0 (initial version).
 * Add migration logic here as schema evolves.
 */
const runMigrations = (_fromVersion: string, _toVersion: string): Effect.Effect<void> =>
  Effect.gen(function* () {
    // Initial version - no migrations needed yet.
    // Future migrations will be added here:
    // if (semverOrder(fromVersion, "1.1.0") < 0) {
    //   yield* migrate_1_0_0_to_1_1_0()
    // }
    yield* Effect.logInfo('Migrations complete')
  })

// ============================================
// Schema Version Check
// ============================================

const SCHEMA_VERSION_KEY = 'schema_version'

/**
 * Ensure local database schema is compatible with this CLI/TUI version.
 *
 * - Reads schema_version from sync_meta
 * - Compares against EMBEDDED_SCHEMA_VERSION
 * - Runs pending migrations if local < required
 * - Fails with SchemaVersionError if local > required
 * - Sets schema_version after successful migration
 */
export const ensureSchema = Effect.gen(function* () {
  const local = yield* LocalDb

  // Get current local schema version
  const localVersionOpt = yield* local.getMeta(SCHEMA_VERSION_KEY)
  const localVersion = Option.getOrElse(localVersionOpt, () => '0.0.0')
  const requiredVersion = EMBEDDED_SCHEMA_VERSION

  const comparison = semverOrder(localVersion, requiredVersion)

  if (comparison < 0) {
    // Local is older - run migrations
    yield* Effect.logInfo('Running schema migrations').pipe(
      Effect.annotateLogs({ from: localVersion, to: requiredVersion }),
    )
    yield* runMigrations(localVersion, requiredVersion)
    yield* local.setMeta(SCHEMA_VERSION_KEY, requiredVersion)
    yield* Effect.logInfo('Schema version updated').pipe(Effect.annotateLogs({ version: requiredVersion }))
  } else if (comparison > 0) {
    // Local is newer than CLI supports
    yield* Effect.fail(
      new SchemaVersionError({
        localVersion,
        requiredVersion,
        message: 'Please update CLI: your local DB is newer than this version supports',
      }),
    )
  }
  // comparison === 0 means versions match, nothing to do
})
