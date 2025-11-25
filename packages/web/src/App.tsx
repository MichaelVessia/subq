import { useState } from 'react'
import { WeightLogList } from './components/weight/WeightLogList.js'
import { InjectionLogList } from './components/injection/InjectionLogList.js'

type Tab = 'weight' | 'injection'

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('weight')

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem', fontFamily: 'system-ui' }}>
      <h1 style={{ marginBottom: '1rem' }}>Health Tracker</h1>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          borderBottom: '1px solid #ccc',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('weight')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'weight' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'weight' ? '#2563eb' : '#666',
          }}
        >
          Weight
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('injection')}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'injection' ? '2px solid #2563eb' : '2px solid transparent',
            color: activeTab === 'injection' ? '#2563eb' : '#666',
          }}
        >
          Injections
        </button>
      </div>

      {activeTab === 'weight' && <WeightLogList />}
      {activeTab === 'injection' && <InjectionLogList />}
    </div>
  )
}
