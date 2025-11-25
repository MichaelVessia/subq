import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RegistryProvider } from '@effect-atom/atom-react'
import { App } from './App.js'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <RegistryProvider>
      <App />
    </RegistryProvider>
  </StrictMode>,
)
