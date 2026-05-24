import { describe, expect, it } from '@effect/vitest'
import {
  listDefaultInjectionSites,
  listKnownDrugVariants,
  suggestedDosagesForDrug,
} from '../src/drug-vocabulary/index.js'
import { getNextSite, SITE_ROTATION } from '../src/injection/index.js'

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

  it('uses every default injection site in site rotation order', () => {
    expect(listDefaultInjectionSites()).toEqual([...SITE_ROTATION])
    expect(getNextSite('Left abdomen')).toBe('Right abdomen')
    expect(getNextSite('Right abdomen')).toBe('Left thigh')
    expect(getNextSite('Left thigh')).toBe('Right thigh')
    expect(getNextSite('Right thigh')).toBe('Left upper arm')
    expect(getNextSite('Left upper arm')).toBe('Right upper arm')
    expect(getNextSite('Right upper arm')).toBe('Left abdomen')
  })
})
