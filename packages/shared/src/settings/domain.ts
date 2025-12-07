// ============================================
// Settings Primitives
// ============================================

/**
 * Supported weight units for display.
 * - "lbs" = pounds (US)
 * - "kg" = kilograms (metric)
 *
 * Note: All weights are stored internally as lbs.
 * This setting only affects display/input conversion.
 */
export type WeightUnit = 'lbs' | 'kg'

// ============================================
// Default Settings
// ============================================

export const DEFAULT_WEIGHT_UNIT: WeightUnit = 'lbs'
