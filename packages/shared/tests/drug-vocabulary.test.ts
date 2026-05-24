import { describe, expect, it } from '@effect/vitest'
import {
  drugVariantsForInventoryForm,
  listDefaultInjectionSites,
  listKnownDrugVariants,
  suggestedDosagesForDrug,
  supportsInventoryForm,
} from '../src/drug-vocabulary/index.js'

describe('DrugVocabulary', () => {
  it('provides known drug variants for injection and schedule choices', () => {
    expect(listKnownDrugVariants()).toEqual([
      'Semaglutide (Ozempic)',
      'Semaglutide (Wegovy)',
      'Semaglutide (Compounded)',
      'Tirzepatide (Mounjaro)',
      'Tirzepatide (Zepbound)',
      'Tirzepatide (Compounded)',
      'Retatrutide (Compounded)',
      'Liraglutide (Saxenda)',
      'Dulaglutide (Trulicity)',
    ])
  })

  it('provides dosage suggestions for a selected drug variant', () => {
    expect(suggestedDosagesForDrug('Tirzepatide (Zepbound)')).toEqual([
      '2.5mg',
      '5mg',
      '7.5mg',
      '10mg',
      '12.5mg',
      '15mg',
    ])
  })

  it('matches dosage suggestions when stored drug names include the known variant', () => {
    expect(suggestedDosagesForDrug('Tirzepatide (Zepbound) - Lilly')).toEqual([
      '2.5mg',
      '5mg',
      '7.5mg',
      '10mg',
      '12.5mg',
      '15mg',
    ])
  })

  it('filters drug variants by inventory form compatibility', () => {
    expect(drugVariantsForInventoryForm('vial')).toEqual([
      'Semaglutide (Compounded)',
      'Tirzepatide (Compounded)',
      'Retatrutide (Compounded)',
    ])
    expect(drugVariantsForInventoryForm('pen')).toEqual([
      'Semaglutide (Ozempic)',
      'Semaglutide (Wegovy)',
      'Tirzepatide (Mounjaro)',
      'Tirzepatide (Zepbound)',
      'Liraglutide (Saxenda)',
      'Dulaglutide (Trulicity)',
    ])
  })

  it('checks whether a drug variant supports an inventory form', () => {
    expect(supportsInventoryForm('Retatrutide (Compounded)', 'vial')).toBe(true)
    expect(supportsInventoryForm('Retatrutide (Compounded)', 'pen')).toBe(false)
  })

  it('provides default injection site rotation choices', () => {
    expect(listDefaultInjectionSites()).toEqual([
      'Left abdomen',
      'Right abdomen',
      'Left thigh',
      'Right thigh',
      'Left upper arm',
      'Right upper arm',
    ])
  })
})
