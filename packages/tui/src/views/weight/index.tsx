// Weight view - manages list/form state

import type { WeightLog } from '@subq/shared'
import { useState } from 'react'
import { WeightForm } from './form'
import { WeightListView } from './list'

interface WeightViewProps {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

type ViewState = { mode: 'list' } | { mode: 'form'; item?: WeightLog }

export function WeightView({ onMessage }: WeightViewProps) {
  const [viewState, setViewState] = useState<ViewState>({ mode: 'list' })

  if (viewState.mode === 'form') {
    return (
      <WeightForm
        {...(viewState.item ? { item: viewState.item } : {})}
        onSave={() => setViewState({ mode: 'list' })}
        onCancel={() => setViewState({ mode: 'list' })}
        onMessage={onMessage}
      />
    )
  }

  return (
    <WeightListView
      onNew={() => setViewState({ mode: 'form' })}
      onEdit={(item) => setViewState({ mode: 'form', item })}
      onMessage={onMessage}
    />
  )
}
