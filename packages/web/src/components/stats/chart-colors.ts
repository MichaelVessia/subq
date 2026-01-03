// Color palette for dosages - muted tones
const DOSAGE_COLORS: Record<string, string> = {
  '2.5mg': '#64748b', // slate
  '5mg': '#0891b2', // cyan
  '7.5mg': '#0d9488', // teal
  '10mg': '#059669', // emerald
  '12.5mg': '#7c3aed', // violet
  '15mg': '#be185d', // pink
}

// Colorful fallback colors for unknown dosages
const FALLBACK_COLORS = [
  '#0891b2', // cyan
  '#059669', // emerald
  '#7c3aed', // violet
  '#be185d', // pink
  '#f59e0b', // amber
  '#10b981', // green
  '#6366f1', // indigo
  '#ec4899', // fuchsia
]

/**
 * Get color for a dosage. Supports both plain dosage ("10mg") and
 * composite keys ("Semaglutide::10mg") for drug+dosage combinations.
 */
export function getDosageColor(keyOrDosage: string): string {
  // Check if it's a composite key (drug::dosage)
  const parts = keyOrDosage.split('::')
  const dosage = parts.length === 2 ? parts[1]! : keyOrDosage

  // First try exact dosage match
  const mapped = DOSAGE_COLORS[dosage]
  if (mapped) return mapped

  // For composite keys, hash the full key for unique colors per drug+dosage
  const hash = keyOrDosage.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length] ?? '#0891b2'
}

export const CHART_COLORS = [
  '#0891b2', // cyan
  '#059669', // emerald
  '#7c3aed', // violet
  '#be185d', // pink
  '#64748b', // slate
  '#f59e0b', // amber
  '#10b981', // green
  '#6366f1', // indigo
]
