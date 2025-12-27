// Inventory view - manages list/form state

import type { Inventory } from '@subq/shared'
import { useState } from 'react'
import { InventoryForm } from './form'
import { InventoryListView } from './list'

interface InventoryViewProps {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

type ViewState = { mode: 'list' } | { mode: 'form'; item?: Inventory }

export function InventoryView({ onMessage }: InventoryViewProps) {
  const [viewState, setViewState] = useState<ViewState>({ mode: 'list' })

  if (viewState.mode === 'form') {
    return (
      <InventoryForm
        {...(viewState.item ? { item: viewState.item } : {})}
        onSave={() => setViewState({ mode: 'list' })}
        onCancel={() => setViewState({ mode: 'list' })}
        onMessage={onMessage}
      />
    )
  }

  return (
    <InventoryListView
      onNew={() => setViewState({ mode: 'form' })}
      onEdit={(item) => setViewState({ mode: 'form', item })}
      onMessage={onMessage}
    />
  )
}
