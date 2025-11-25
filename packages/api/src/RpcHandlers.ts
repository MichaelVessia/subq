import { AppRpcs } from '@scale/shared'
import { Effect, Layer } from 'effect'
import { Greeter } from './Greeter.js'

export const RpcHandlersLive = AppRpcs.toLayer(
  Effect.gen(function* () {
    const greeter = yield* Greeter

    return {
      Greet: ({ name }) => greeter.greet(name),
    }
  }),
).pipe(Layer.provide(Greeter.layer))
