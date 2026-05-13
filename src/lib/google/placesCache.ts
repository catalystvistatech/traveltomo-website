import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedPlace } from "./places";

/**
 * Default cache TTL for Google Places lookups, in hours. POIs change
 * slowly (their name / location / rating only drift over weeks), so a
 * 24-hour TTL cuts Google API spend by ~95% without measurable UX
 * impact. Override via `PLACES_CACHE_TTL_HOURS` env var when tuning.
 */
export const DEFAULT_CACHE_TTL_HOURS = (() => {
  const raw = process.env.PLACES_CACHE_TTL_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
})();

/**
 * Possible values for `places.refresh_source`. Used as a metadata
 * tag on every mirrored row so we can audit how the cache was warmed
 * (and which rows are safe to clean up on staleness sweeps).
 */
export type PlaceRefreshSource =
  | "google_nearby"
  | "google_search_text"
  | "prewarmed"
  | "manual";

/**
 * The minimum number of cached rows we need in the bounding box to
 * call the cache hit "useful". Below this we fall through to Google
 * so the home feed doesn't surface an awkwardly-empty list.
 */
const DEFAULT_MIN_CACHED_RESULTS = 5;

/**
 * Approximate kilometres per degree of latitude. Longitude scales by
 * `cos(lat)` -- handled inline.
 */
const KM_PER_DEGREE_LAT = 111;

/**
 * Look the `places` table up for rows near `(latitude, longitude)`
 * that are still inside the TTL window OR explicitly flagged
 * `prewarmed`. Used as the fast-path inside `/v1/places` so the
 * route can skip Google entirely on cache hits.
 */
export async function lookupCachedPlaces({
  latitude,
  longitude,
  radiusMeters = 5_000,
  ttlHours = DEFAULT_CACHE_TTL_HOURS,
  minResults = DEFAULT_MIN_CACHED_RESULTS,
  limit = 50,
}: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  ttlHours?: number;
  minResults?: number;
  limit?: number;
}): Promise<NormalizedPlace[]> {
  const admin = createAdminClient();

  // Bounding box: 1 deg lat ≈ 111 km, 1 deg lng ≈ 111 km × cos(lat).
  // We over-fetch a little (sqrt-2 corner padding) so a perfectly
  // circular radius isn't clipped at the diagonals.
  const radiusKm = radiusMeters / 1000;
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const lngDelta =
    radiusKm /
    (KM_PER_DEGREE_LAT *
      Math.max(Math.cos((latitude * Math.PI) / 180), 0.0001));

  const cutoff = new Date(
    Date.now() - ttlHours * 3600 * 1000,
  ).toISOString();

  const { data, error } = await admin
    .from("places")
    .select(
      "id, name, description, latitude, longitude, category, image_url, city, rating, user_ratings_total, google_place_id, refreshed_at, prewarmed",
    )
    .eq("is_active", true)
    .gte("latitude", latitude - latDelta)
    .lte("latitude", latitude + latDelta)
    .gte("longitude", longitude - lngDelta)
    .lte("longitude", longitude + lngDelta)
    .or(`prewarmed.eq.true,refreshed_at.gte.${cutoff}`)
    .limit(limit);

  if (error) {
    console.error("lookupCachedPlaces failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  if (rows.length < minResults) return [];

  // Filter the bounding-box approximation down to a true radius via
  // haversine. This keeps the corner padding from polluting results
  // in dense cities.
  const inside = rows.filter((row) => {
    const r = row as Record<string, unknown>;
    const rLat = r.latitude as number | null;
    const rLng = r.longitude as number | null;
    if (rLat == null || rLng == null) return false;
    return haversineMeters(latitude, longitude, rLat, rLng) <= radiusMeters;
  });
  if (inside.length < minResults) return [];

  return inside.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      category: (r.category as string | null) ?? null,
      image_url: (r.image_url as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      rating: (r.rating as number | null) ?? null,
      user_ratings_total: (r.user_ratings_total as number | null) ?? null,
      google_place_id: (r.google_place_id as string) ?? "",
    } satisfies NormalizedPlace;
  });
}

/**
 * Mirrors Google Places results into our own `places` table so that:
 *   - each place has a stable Supabase UUID the app and merchants can use,
 *   - future queries hit Postgres instead of paying Google per request,
 *   - merchants can attach businesses/challenges to these places by UUID.
 *
 * Upsert by `google_place_id` (unique index). Missing rows are inserted;
 * existing rows keep their UUID but get refreshed metadata.
 *
 * `refreshed_at` is bumped to `now()` on every upsert so the cache TTL
 * resets each time we pay Google for fresh data. `prewarmed` is only
 * touched when explicitly passed -- the default false keeps regular
 * Google traffic from accidentally flipping prewarmed rows back to
 * "expires after 24h".
 */
export async function mirrorPlaces(
  places: NormalizedPlace[],
  options: {
    source?: PlaceRefreshSource;
    prewarmed?: boolean;
  } = {},
): Promise<NormalizedPlace[]> {
  if (places.length === 0) return places;
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const source = options.source ?? "google_nearby";

  const rows = places.map((p) => ({
    name: p.name,
    description: p.description,
    latitude: p.latitude,
    longitude: p.longitude,
    category: p.category,
    image_url: p.image_url,
    city: p.city,
    rating: p.rating,
    user_ratings_total: p.user_ratings_total,
    google_place_id: p.google_place_id,
    is_active: true,
    refreshed_at: now,
    refresh_source: source,
    // Only set `prewarmed` when explicitly asked. Leaving it undefined
    // for normal nearby/searchText traffic keeps the previous value
    // intact on conflict updates.
    ...(options.prewarmed !== undefined
      ? { prewarmed: options.prewarmed }
      : {}),
  }));

  const { data, error } = await admin
    .from("places")
    .upsert(rows, { onConflict: "google_place_id", ignoreDuplicates: false })
    .select(
      "id, name, description, latitude, longitude, category, image_url, city, rating, user_ratings_total, google_place_id",
    );

  if (error) {
    // Don't fail the request because caching failed - just return the
    // Google-derived rows (caller can still render them).
    console.error("mirrorPlaces upsert failed:", error.message);
    return places;
  }

  // Replace each Google-id "id" with the Supabase UUID so downstream
  // clients can deep-link via /v1/places/<uuid>.
  const byGoogle = new Map(data?.map((row) => [row.google_place_id, row]) ?? []);
  return places.map((p) => {
    const row = byGoogle.get(p.google_place_id);
    return row ? { ...p, id: row.id as string } : p;
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
