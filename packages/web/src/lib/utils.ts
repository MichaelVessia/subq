import { type ClassValue, clsx } from 'clsx'
import { DateTime } from 'effect'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ============================================
// DateTime Conversion Utilities
// ============================================

/**
 * Convert a DateTime.Utc to a native Date for use in components
 */
export function toDate(dt: DateTime.Utc): Date {
  return new Date(DateTime.toEpochMillis(dt))
}

/**
 * Format a DateTime.Utc to a date string (YYYY-MM-DD) for form inputs
 */
export function toDateString(dt: DateTime.Utc): string {
  const date = toDate(dt)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
