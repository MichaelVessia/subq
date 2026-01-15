import { useAtomSet } from '@effect-atom/atom-react'
import { DataExport } from '@subq/shared'
import { DateTime, Effect, Schema } from 'effect'
import { useRef, useState } from 'react'
import { ApiClient, ReactivityKeys } from '../../rpc.js'
import { Button } from '../ui/button.js'

export function DataManagement() {
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingImportData, setPendingImportData] = useState<DataExport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportData = useAtomSet(ApiClient.mutation('UserDataExport'), { mode: 'promise' })
  const importData = useAtomSet(ApiClient.mutation('UserDataImport'), { mode: 'promise' })

  const handleExport = async () => {
    setIsExporting(true)
    setImportError(null)
    setImportSuccess(null)

    try {
      const result = await exportData({
        payload: undefined,
        reactivityKeys: [],
      })

      // Convert to JSON and trigger download
      const encoded = await Effect.runPromise(Schema.encode(DataExport)(result))
      const json = JSON.stringify(encoded, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `subq-export-${DateTime.formatIso(DateTime.unsafeNow()).split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
      setImportError('Failed to export data. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)
    setImportSuccess(null)

    try {
      const text = await file.text()
      const json: unknown = JSON.parse(text)

      // Validate the data structure using Effect Schema
      const decoded = await Effect.runPromise(Schema.decodeUnknown(DataExport)(json))
      setPendingImportData(decoded)
      setShowConfirm(true)
    } catch (error) {
      console.error('File validation failed:', error)
      setImportError('Invalid export file. Please select a valid SubQ export file.')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingImportData) return

    setIsImporting(true)
    setShowConfirm(false)

    try {
      const result = await importData({
        payload: pendingImportData,
        reactivityKeys: [
          ReactivityKeys.weightLogs,
          ReactivityKeys.injectionLogs,
          ReactivityKeys.inventory,
          ReactivityKeys.schedule,
          ReactivityKeys.goals,
          ReactivityKeys.settings,
        ],
      })

      setImportSuccess(
        `Successfully imported: ${result.weightLogs} weight logs, ${result.injectionLogs} injection logs, ${result.inventory} inventory items, ${result.schedules} schedules, ${result.goals} goals`,
      )
    } catch (error) {
      console.error('Import failed:', error)
      setImportError('Failed to import data. Please try again.')
    } finally {
      setIsImporting(false)
      setPendingImportData(null)
    }
  }

  const handleCancelImport = () => {
    setShowConfirm(false)
    setPendingImportData(null)
  }

  const getSummary = (data: DataExport) => {
    const d = data.data
    return `${d.weightLogs.length} weight logs, ${d.injectionLogs.length} injection logs, ${d.inventory.length} inventory items, ${d.schedules.length} schedules, ${d.goals.length} goals`
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium mb-2">Export Data</h4>
        <p className="text-sm text-muted-foreground mb-3">Download all your data as a JSON file for backup purposes.</p>
        <Button onClick={handleExport} disabled={isExporting} variant="outline">
          {isExporting ? 'Exporting...' : 'Export Data'}
        </Button>
      </div>

      <div className="border-t pt-4">
        <h4 className="font-medium mb-2">Import Data</h4>
        <p className="text-sm text-muted-foreground mb-3">
          Restore data from a previously exported file. This will replace all existing data.
        </p>
        <input type="file" accept=".json" onChange={handleFileSelect} ref={fileInputRef} className="hidden" />
        <Button onClick={() => fileInputRef.current?.click()} disabled={isImporting} variant="outline">
          {isImporting ? 'Importing...' : 'Import Data'}
        </Button>
      </div>

      {importError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-md text-sm">
          {importError}
        </div>
      )}

      {importSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 px-4 py-3 rounded-md text-sm">
          {importSuccess}
        </div>
      )}

      {showConfirm && pendingImportData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 max-w-md mx-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Confirm Import</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This will <strong>replace all your existing data</strong> with the imported data:
            </p>
            <p className="text-sm mb-4 font-mono bg-muted p-2 rounded">{getSummary(pendingImportData)}</p>
            <p className="text-sm text-destructive mb-4">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleCancelImport}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmImport}>
                Replace All Data
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
