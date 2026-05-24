import { SITE_ROTATION } from '../injection/site-rotation.js'

export interface DrugVocabularyEntry {
  readonly name: string
  readonly suggestedDosages: readonly string[]
}

const DrugVocabularyEntries: readonly DrugVocabularyEntry[] = [
  { name: 'Semaglutide (Ozempic)', suggestedDosages: ['0.25mg', '0.5mg', '1mg', '2mg'] },
  {
    name: 'Semaglutide (Wegovy)',
    suggestedDosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2.4mg'],
  },
  {
    name: 'Semaglutide (Compounded)',
    suggestedDosages: ['0.25mg', '0.5mg', '1mg', '1.7mg', '2mg', '2.4mg'],
  },
  {
    name: 'Tirzepatide (Mounjaro)',
    suggestedDosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'],
  },
  {
    name: 'Tirzepatide (Zepbound)',
    suggestedDosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'],
  },
  {
    name: 'Tirzepatide (Compounded)',
    suggestedDosages: ['2.5mg', '5mg', '7.5mg', '10mg', '12.5mg', '15mg'],
  },
  {
    name: 'Retatrutide (Compounded)',
    suggestedDosages: ['1mg', '2mg', '4mg', '8mg', '12mg'],
  },
  {
    name: 'Liraglutide (Saxenda)',
    suggestedDosages: ['0.6mg', '1.2mg', '1.8mg', '2.4mg', '3mg'],
  },
  { name: 'Dulaglutide (Trulicity)', suggestedDosages: ['0.75mg', '1.5mg', '3mg', '4.5mg'] },
]

export function listKnownDrugVariants(): string[] {
  return DrugVocabularyEntries.map((entry) => entry.name)
}

export function suggestedDosagesForDrug(drug: string): string[] {
  const entry = findDrugVocabularyEntry(drug)
  return entry ? entry.suggestedDosages.map((dosage) => dosage) : []
}

export function listDefaultInjectionSites(): string[] {
  return SITE_ROTATION.map((site) => site)
}

function findDrugVocabularyEntry(drug: string): DrugVocabularyEntry | undefined {
  const normalizedDrug = normalizeDrugName(drug)
  if (normalizedDrug === '') return undefined

  return DrugVocabularyEntries.find((entry) => {
    const normalizedEntryName = normalizeDrugName(entry.name)
    return normalizedDrug === normalizedEntryName || normalizedDrug.includes(normalizedEntryName)
  })
}

function normalizeDrugName(drug: string): string {
  return drug.trim().toLowerCase()
}
