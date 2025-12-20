import { Rpc, RpcGroup } from '@effect/rpc'
import { DataExport, DataExportError, DataImportError, DataImportResult } from './domain.js'

// ============================================
// Data Export/Import RPCs
// ============================================

export const DataExportRpcs = RpcGroup.make(
  /**
   * Export all user data as a portable JSON structure.
   */
  Rpc.make('UserDataExport', {
    success: DataExport,
    error: DataExportError,
  }),

  /**
   * Import user data, replacing all existing data.
   * WARNING: This will delete all existing user data before importing.
   */
  Rpc.make('UserDataImport', {
    payload: DataExport,
    success: DataImportResult,
    error: DataImportError,
  }),
)
