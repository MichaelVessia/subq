import type { D1Database } from '@cloudflare/workers-types'
import type { SqlClient } from '@effect/sql'
import { D1Client } from '@effect/sql-d1'
import type { ConfigError, Layer } from 'effect'

// Cloudflare Workers: D1 binding
export const makeD1Layer = (db: D1Database): Layer.Layer<SqlClient.SqlClient, ConfigError.ConfigError> =>
  D1Client.layer({ db })
