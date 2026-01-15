/**
 * Standard injection site rotation order.
 * Used to suggest the next injection site based on the last one used.
 */
export const SITE_ROTATION = [
  'Left abdomen',
  'Right abdomen',
  'Left thigh',
  'Right thigh',
  'Left upper arm',
  'Right upper arm',
] as const

export type InjectionSiteRotation = (typeof SITE_ROTATION)[number]

const isValidSite = (site: string): site is InjectionSiteRotation => (SITE_ROTATION as readonly string[]).includes(site)

/**
 * Get the next suggested injection site based on the last site used.
 * Rotates through sites in order to help distribute injection locations.
 */
export function getNextSite(lastSite: string | null): InjectionSiteRotation {
  const defaultSite = SITE_ROTATION[0]
  if (!lastSite || !isValidSite(lastSite)) return defaultSite
  const currentIndex = SITE_ROTATION.indexOf(lastSite)
  return SITE_ROTATION[(currentIndex + 1) % SITE_ROTATION.length] ?? defaultSite
}
