// How far away a live quest can be and still show up for a traveler.
//
// Featured and the Quests list used to disagree: Featured looked 150 km out,
// the Quests list only inside each business's own service radius, so Home
// could feature a quest the Quests list said didn't exist. Both lists now
// share this ceiling. The service radius still matters: quests whose area
// the traveler is already inside sort first and are flagged `in_area`.

import { effectiveServiceRadius } from "@/lib/constants/service-radius";

/** Default discovery reach for both Featured and the Quests list. */
export const DISCOVERY_RADIUS_M = 150_000;

/** Reads `max_radius_km`, falling back to (and never exceeding) the default. */
export function discoveryRadiusMeters(maxRadiusKm: string | null): number {
  const km = parseFloat(maxRadiusKm ?? "");
  if (!Number.isFinite(km) || km <= 0) return DISCOVERY_RADIUS_M;
  return Math.min(km * 1000, DISCOVERY_RADIUS_M);
}

/** True when the traveler is inside the business's own service area. */
export function inServiceArea(distanceMeters: number | null, serviceRadiusMeters: number | null): boolean {
  return distanceMeters != null && distanceMeters <= effectiveServiceRadius(serviceRadiusMeters);
}
