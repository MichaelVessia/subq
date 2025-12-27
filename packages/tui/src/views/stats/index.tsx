// Stats view - displays statistics dashboard

import { StatsDashboard } from './dashboard'

interface StatsViewProps {
  onMessage: (text: string, type: 'success' | 'error' | 'info') => void
}

export function StatsView({ onMessage }: StatsViewProps) {
  return <StatsDashboard onMessage={onMessage} />
}
