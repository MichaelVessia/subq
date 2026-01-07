import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'
import { App } from './app'
import { theme } from './theme'

// Enable bracketed paste mode for clipboard support
process.stdout.write('\x1b[?2004h')

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
  backgroundColor: theme.bg,
})

// Disable bracketed paste mode on exit
const cleanup = () => process.stdout.write('\x1b[?2004l')
process.on('exit', cleanup)
process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

createRoot(renderer).render(<App />)
