// Shared formatting utilities for TUI views

import { DateTime } from 'effect'

/**
 * Pad/truncate string to fixed width.
 * Truncates with ellipsis if too long.
 */
export const pad = (str: string, len: number): string => {
  if (str.length > len - 1) return `${str.slice(0, len - 2)}… `
  return str.padEnd(len)
}

/**
 * Format a DateTime.Utc for display.
 */
export const formatDate = (date: DateTime.Utc): string => {
  const d = DateTime.toDate(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format a nullable DateTime.Utc for display.
 */
export const formatDateOrDash = (date: DateTime.Utc | null): string => {
  if (!date) return '-'
  return formatDate(date)
}
