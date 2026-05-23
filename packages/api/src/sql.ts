import type { SqlClient } from 'effect/unstable/sql'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { Config, type Layer } from 'effect'

// SQLite file configuration
const SqliteConfig = Config.string('DATABASE_PATH').pipe(Config.withDefault('./data/subq.db'))

export const SqlLive: Layer.Layer<SqlClient.SqlClient, Config.ConfigError> = SqliteClient.layerConfig(
  Config.map(SqliteConfig, (filename) => ({ filename })),
)
