import { DataExport, DataImportError, DataImportResult } from '@subq/shared'
import { Effect } from 'effect'

export interface DataImportPlan {
  readonly snapshot: DataExport
  readonly result: DataImportResult
}

const invalidImport = (message: string) => Effect.fail(DataImportError.make({ message }))

export const planDataImport = (snapshot: DataExport): Effect.Effect<DataImportPlan, DataImportError> =>
  Effect.gen(function* () {
    const scheduleIds = new Set(snapshot.data.schedules.map((schedule) => schedule.id))

    for (const schedule of snapshot.data.schedules) {
      for (const phase of schedule.phases) {
        if (phase.scheduleId !== schedule.id) {
          return yield* invalidImport(
            `Phase ${phase.id} references schedule ${phase.scheduleId}, expected ${schedule.id}`,
          )
        }
      }
    }

    for (const log of snapshot.data.injectionLogs) {
      if (log.scheduleId !== null && !scheduleIds.has(log.scheduleId)) {
        return yield* invalidImport(`Injection log ${log.id} references missing schedule ${log.scheduleId}`)
      }
    }

    return {
      snapshot,
      result: new DataImportResult({
        weightLogs: snapshot.data.weightLogs.length,
        injectionLogs: snapshot.data.injectionLogs.length,
        schedules: snapshot.data.schedules.length,
        goals: snapshot.data.goals.length,
        settingsUpdated: snapshot.data.settings !== null,
      }),
    }
  })
