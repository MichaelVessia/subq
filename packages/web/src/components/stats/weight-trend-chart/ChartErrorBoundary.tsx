import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback: ReactNode
}

interface State {
  hasError: boolean
}

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, errorInfo: { componentStack: string }): void {
    console.error('Chart error:', error, errorInfo)
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback
    }

    return this.props.children
  }
}

export function ChartErrorFallback() {
  return (
    <div className="flex items-center justify-center h-[320px] text-muted-foreground">
      <div className="text-center">
        <div className="font-semibold mb-1">Chart Error</div>
        <div className="text-sm">Unable to render chart. Please try refreshing the page.</div>
      </div>
    </div>
  )
}
