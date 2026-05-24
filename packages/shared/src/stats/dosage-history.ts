import { Dosage, DosageValue, DrugName } from '../common/domain.js'
import { DosageHistoryPoint, DosageHistoryStats } from './domain.js'

export interface DosageHistoryInput {
  readonly date: Date
  readonly drug: string
  readonly dosage: string
}

export const parseDosageValue = (dosage: string): number => {
  const match = dosage.match(/(\d+(?:\.\d+)?)/)
  const captured = match?.[1]
  return captured === undefined ? 0 : Number.parseFloat(captured)
}

export const buildDosageHistoryStats = (inputs: readonly DosageHistoryInput[]): DosageHistoryStats =>
  new DosageHistoryStats({
    points: inputs.map(
      (input) =>
        new DosageHistoryPoint({
          date: input.date,
          drug: DrugName.make(input.drug),
          dosage: Dosage.make(input.dosage),
          dosageValue: DosageValue.make(parseDosageValue(input.dosage)),
        }),
    ),
  })
