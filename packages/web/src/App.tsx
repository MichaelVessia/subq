import { Atom, useAtomValue, useAtomSet } from '@effect-atom/atom-react'
import { Effect, ManagedRuntime } from 'effect'
import { useCallback, useState } from 'react'
import { ApiClient, RpcLive } from './rpc.js'

const runtime = ManagedRuntime.make(RpcLive)

const greetingAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive)

export function App() {
  const [name, setName] = useState('')
  const greeting = useAtomValue(greetingAtom)
  const setGreeting = useAtomSet(greetingAtom)

  const handleGreet = useCallback(() => {
    const program = Effect.gen(function* () {
      const client = yield* ApiClient
      const result = yield* client.Greet({ name })
      return result
    })

    runtime.runPromise(program).then(setGreeting)
  }, [name, setGreeting])

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>GLP-1 Tracker</h1>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={{ padding: '0.5rem', marginRight: '0.5rem' }}
        />
        <button type="button" onClick={handleGreet} style={{ padding: '0.5rem 1rem' }}>
          Greet
        </button>
      </div>
      {greeting && <p style={{ fontSize: '1.5rem' }}>{greeting}</p>}
    </div>
  )
}
