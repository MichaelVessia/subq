import type { SqlClient } from '@effect/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Config, type ConfigError, type Layer } from 'effect'

// SQLite configuration - uses file path for local dev
// For Cloudflare Workers, this will be replaced with D1 adapter
const SqliteConfig = Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/scalability.db'))

// Create the SQLite client layer
export const SqlLive: Layer.Layer<SqliteClient.SqliteClient | SqlClient.SqlClient, ConfigError.ConfigError> =
  SqliteClient.layerConfig(Config.map(SqliteConfig, (filename) => ({ filename })))
