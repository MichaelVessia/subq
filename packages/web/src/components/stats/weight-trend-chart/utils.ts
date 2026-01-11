export function makeDrugDosageKey(drug: string, dosage: string): string {
  return `${drug}::${dosage}`
}

export const PILL_CONSTANTS = {
  WIDTH_SINGLE: 44,
  HEIGHT: 18,
  MIN_GAP_X: 4,
  VERTICAL_GAP: 4,
} as const
