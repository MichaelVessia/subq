import { NodeContext, NodeRuntime } from '@effect/platform-node'
import { Console, Effect } from 'effect'

import { cli } from './cli.js'

const program = Effect.suspend(() => cli(process.argv)).pipe(
  Effect.catchTag('Unauthorized', (err) =>
    Console.error(`Not authenticated: ${err.details}\nRun 'subq login' to authenticate.`).pipe(
      Effect.andThen(Effect.sync(() => process.exit(1))),
    ),
  ),
  Effect.provide(NodeContext.layer),
)

NodeRuntime.runMain(program)
