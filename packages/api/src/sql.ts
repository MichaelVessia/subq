import type { D1Database } from '@cloudflare/workers-types'
import type { SqlClient } from '@effect/sql'
import { D1Client } from '@effect/sql-d1'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Config, type ConfigError, type Layer } from 'effect'

// Local dev: SQLite file
const SqliteConfig = Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/subq.db'))

export const SqliteLive: Layer.Layer<SqlClient.SqlClient, ConfigError.ConfigError> = SqliteClient.layerConfig(
  Config.map(SqliteConfig, (filename) => ({ filename })),
)

// Cloudflare Workers: D1 binding
export const makeD1Layer = (db: D1Database): Layer.Layer<SqlClient.SqlClient, ConfigError.ConfigError> =>
  D1Client.layer({ db })

// Default for local dev - swap at entrypoint for Workers
export const SqlLive = SqliteLive
