// Injections view - manages list/form state

import type { InjectionLog } from '@subq/shared'
import { useState } from 'react'
import { InjectionForm } from './form'
import { InjectionListView } from './list'

interface InjectionsViewProps {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

type ViewState = { mode: 'list' } | { mode: 'form'; injection?: InjectionLog }

export function InjectionsView({ onMessage }: InjectionsViewProps) {
  const [viewState, setViewState] = useState<ViewState>({ mode: 'list' })

  if (viewState.mode === 'form') {
    return (
      <InjectionForm
        {...(viewState.injection ? { injection: viewState.injection } : {})}
        onSave={() => setViewState({ mode: 'list' })}
        onCancel={() => setViewState({ mode: 'list' })}
        onMessage={onMessage}
      />
    )
  }

  return (
    <InjectionListView
      onNew={() => setViewState({ mode: 'form' })}
      onEdit={(injection) => setViewState({ mode: 'form', injection })}
      onMessage={onMessage}
    />
  )
}
