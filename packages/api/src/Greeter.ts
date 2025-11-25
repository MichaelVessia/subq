import { Context, Effect, Layer } from 'effect'

export class Greeter extends Context.Tag('@scale/Greeter')<
  Greeter,
  {
    readonly greet: (name: string) => Effect.Effect<string>
  }
>() {
  static readonly layer = Layer.succeed(Greeter, {
    greet: (name) => Effect.succeed(`Hello, ${name}!`),
  })
}
