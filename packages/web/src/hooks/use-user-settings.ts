import { kgToLbs, lbsToKg, type WeightUnit, DEFAULT_WEIGHT_UNIT } from '@subq/shared'
import { useMemo, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'subq-weight-unit'

function getStoredWeightUnit(): WeightUnit {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'kg' || stored === 'lbs') return stored
  } catch {
    // localStorage not available
  }
  return DEFAULT_WEIGHT_UNIT
}

function setStoredWeightUnit(unit: WeightUnit) {
  try {
    localStorage.setItem(STORAGE_KEY, unit)
    window.dispatchEvent(new Event('storage'))
  } catch {
    // localStorage not available
  }
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

/**
 * Hook for accessing user settings with weight conversion utilities.
 *
 * All weights are stored internally as lbs. This hook provides helpers
 * to convert between storage format (lbs) and the user's preferred display unit.
 *
 * NOTE: Settings are stored in localStorage due to Effect RPC compatibility issue.
 */
export function useUserSettings() {
  const weightUnit = useSyncExternalStore(subscribe, getStoredWeightUnit, () => DEFAULT_WEIGHT_UNIT)

  const isLoading = false

  /**
   * Convert a weight from internal storage (lbs) to display unit.
   * Use this when displaying weights from the API.
   */
  const displayWeight = useMemo(() => {
    return (lbs: number): number => {
      if (weightUnit === 'kg') {
        return lbsToKg(lbs)
      }
      return lbs
    }
  }, [weightUnit])

  /**
   * Convert a weight from the user's input unit to storage format (lbs).
   * Use this before sending weights to the API.
   */
  const toStorageLbs = useMemo(() => {
    return (value: number): number => {
      if (weightUnit === 'kg') {
        return kgToLbs(value)
      }
      return value
    }
  }, [weightUnit])

  /**
   * Format a weight value for display with the appropriate unit suffix.
   * @param lbs Weight in lbs (from storage)
   * @param decimals Number of decimal places (default 1)
   */
  const formatWeight = useMemo(() => {
    return (lbs: number, decimals = 1): string => {
      const value = displayWeight(lbs)
      return `${value.toFixed(decimals)} ${weightUnit}`
    }
  }, [displayWeight, weightUnit])

  /**
   * Get just the unit label for display.
   */
  const unitLabel = weightUnit

  /**
   * Get the rate suffix for display (e.g., "lbs/week" or "kg/week")
   */
  const rateLabel = `${weightUnit}/week`

  return {
    weightUnit,
    isLoading,
    displayWeight,
    toStorageLbs,
    formatWeight,
    unitLabel,
    rateLabel,
    setWeightUnit: setStoredWeightUnit,
  }
}
