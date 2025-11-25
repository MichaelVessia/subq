import { Effect } from 'effect'

const program = Effect.log('Hello, Effect!')

Effect.runPromise(program)
