import { PgClient } from '@effect/sql-pg'
import { Config, Option } from 'effect'

// Configuration for postgres connection - supports both TCP (DATABASE_URL) and Unix socket (PGHOST)
const SqlConfig = Config.all({
  url: Config.option(Config.redacted('DATABASE_URL')),
  host: Config.option(Config.string('PGHOST')),
  database: Config.string('PGDATABASE').pipe(Config.withDefault('scalability_dev')),
})

// Create the postgres client layer
export const SqlLive = PgClient.layerConfig(
  Config.map(SqlConfig, (c) =>
    Option.isSome(c.url)
      ? { url: c.url.value }
      : { host: Option.getOrElse(c.host, () => '/tmp'), database: c.database },
  ),
)
