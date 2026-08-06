// Single source of truth for a business's traveler-facing reach.
//
// `businesses.service_radius_meters` decides how far away a traveler can be
// and still see that merchant's quests in their feed. It is merchant-editable,
// and the form previously allowed values as low as 100 m — which silently
// makes a merchant unreachable: nobody stands within 100 m of a venue by
// chance, so the quest never appears for anyone and the merchant has no way
// to tell that their own setting is why.
//
// MIN is therefore a floor applied at READ time as well as in validation.
// Applying it on read matters: businesses configured before the floor existed
// (production has one at 100 m) are fixed without editing merchant-owned data.
//
// MAX is the hard ceiling that stops a misconfigured business from reaching
// into every city.

/** Smallest effective reach. Below this a merchant is effectively invisible. */
export const MIN_SERVICE_RADIUS_M = 500;

/** Default reach for a new business. */
export const DEFAULT_SERVICE_RADIUS_M = 2_000;

/** Hard ceiling, regardless of what a merchant configures. */
export const MAX_SERVICE_RADIUS_M = 20_000;

/**
 * Resolves a business's effective reach: applies the default for a missing
 * value, then clamps into [MIN, ceiling]. `ceiling` lets a caller tighten the
 * cap (e.g. a `max_radius_km` query param) but never loosen it past MAX.
 */
export function effectiveServiceRadius(
  configured: number | null | undefined,
  ceiling: number = MAX_SERVICE_RADIUS_M
): number {
  const base = configured ?? DEFAULT_SERVICE_RADIUS_M;
  const cap = Math.min(ceiling, MAX_SERVICE_RADIUS_M);
  return Math.min(Math.max(base, MIN_SERVICE_RADIUS_M), cap);
}
