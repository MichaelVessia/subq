import { PgClient } from '@effect/sql-pg'
import { Config, Secret } from 'effect'

// Configuration for postgres connection
const SqlConfig = Config.all({
  url: Config.string('DATABASE_URL').pipe(Config.withDefault('postgres://localhost/scalability_dev')),
})

// Create the postgres client layer
export const SqlLive = PgClient.layerConfig({
  url: Config.map(SqlConfig, (c) => Secret.fromString(c.url)),
})
