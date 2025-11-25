import { Rpc, RpcGroup } from '@effect/rpc'
import { Schema } from 'effect'

// Hello world RPC for testing connectivity
export class AppRpcs extends RpcGroup.make(
  Rpc.make('Greet', {
    success: Schema.String,
    payload: { name: Schema.String },
  }),
) {}
