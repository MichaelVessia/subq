import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { kgToLbs, lbsToKg, type WeightUnit, DEFAULT_WEIGHT_UNIT, UserSettingsUpdate } from '@subq/shared'
import { useMemo } from 'react'
import { ApiClient, ReactivityKeys, UserSettingsAtom } from '../rpc.js'

/**
 * Hook for accessing user settings with weight conversion utilities.
 *
 * All weights are stored internally as lbs. This hook provides helpers
 * to convert between storage format (lbs) and the user's preferred display unit.
 */
export function useUserSettings() {
  const settingsResult = useAtomValue(UserSettingsAtom)
  const updateSettings = useAtomSet(ApiClient.mutation('UserSettingsUpdate'), { mode: 'promise' })

  const isLoading = Result.isWaiting(settingsResult)
  const settings = Result.getOrElse(settingsResult, () => null)
  const weightUnit: WeightUnit = settings?.weightUnit ?? DEFAULT_WEIGHT_UNIT

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

  /**
   * Update the weight unit preference.
   */
  const setWeightUnit = async (unit: WeightUnit) => {
    await updateSettings({
      payload: new UserSettingsUpdate({ weightUnit: unit }),
      reactivityKeys: [ReactivityKeys.settings],
    })
  }

  return {
    weightUnit,
    isLoading,
    displayWeight,
    toStorageLbs,
    formatWeight,
    unitLabel,
    rateLabel,
    setWeightUnit,
  }
}
