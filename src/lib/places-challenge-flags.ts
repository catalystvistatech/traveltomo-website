import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Annotates a page of place rows with a boolean indicating whether the
 * place currently has at least one live challenge associated with it.
 * Powers the small red dot on Home/place cards so travelers can see at
 * a glance which destinations have something to do.
 *
 * A challenge counts as "associated" with a place when any of:
 *   - challenges.place_id == place.id (direct pin), OR
 *   - challenges.merchant_id == businesses.merchant_id AND
 *     businesses.google_place_id == place.google_place_id
 *     (merchant business linked to the same Google POI), OR
 *   - a live challenge's coordinates fall within PROXIMITY_METERS of the
 *     place coordinates. Challenge stops are geolocated by lat/lng (their
 *     `place_id` is usually null), so proximity is what actually surfaces
 *     "there's something to do here" on the Home feed.
 *
 * No PostgREST embed across challenges/businesses - there is no direct
 * FK (`challenges.merchant_id -> profiles.id`, same for businesses), so
 * we resolve in a few small flat queries instead.
 */
// The red dot means "there's a challenge AT this place", so the proximity
// match is an at-the-spot check (50 m) rather than an area-level hint — a
// place only lights up when a live challenge sits essentially on top of it.
const PROXIMITY_METERS = 50;

function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export async function annotateHasLiveChallenges<
  T extends {
    id?: string | null;
    google_place_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }
>(places: T[]): Promise<(T & { has_live_challenges: boolean })[]> {
  if (places.length === 0) return [];

  // Live-challenge proximity is non-sensitive, area-level info that must be
  // identical for every viewer (and must work for Bearer-token API callers
  // like the iOS app, whose cookie-less server client reads as `anon` and is
  // blocked by the authenticated-only "read live challenges" RLS policy).
  // Use the service-role client so the flag is computed regardless of caller.
  const client = createAdminClient();

  const placeIds = Array.from(
    new Set(
      places.map((p) => p.id).filter((v): v is string => typeof v === "string" && v.length > 0)
    )
  );
  const googleIds = Array.from(
    new Set(
      places
        .map((p) => p.google_place_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0)
    )
  );

  const anyPlaceHasCoords = places.some(
    (p) => typeof p.latitude === "number" && typeof p.longitude === "number",
  );

  const pinnedPlaceIds = new Set<string>();
  const matchingGoogleIds = new Set<string>();
  const liveChallengePoints: { lat: number; lng: number }[] = [];

  // 1. Live challenges pinned directly to one of these places.
  const pinnedTask =
    placeIds.length > 0
      ? client
          .from("challenges")
          .select("place_id")
          .eq("status", "live")
          .in("place_id", placeIds)
          .then(({ data }) => {
            for (const row of data ?? []) {
              const pid = (row as { place_id?: string }).place_id;
              if (pid) pinnedPlaceIds.add(pid);
            }
          })
      : Promise.resolve();

  // 2. Matching businesses (by google_place_id) -> their merchant_ids,
  //    then check which of those merchants own at least one live
  //    challenge. The mapping back to google_place_id stays in JS.
  const merchantToGoogle = new Map<string, Set<string>>();
  const matchingBusinessesTask =
    googleIds.length > 0
      ? client
          .from("businesses")
          .select("google_place_id, merchant_id")
          .in("google_place_id", googleIds)
          .then(({ data }) => {
            for (const row of data ?? []) {
              const r = row as { google_place_id?: string; merchant_id?: string };
              if (!r.merchant_id || !r.google_place_id) continue;
              const set = merchantToGoogle.get(r.merchant_id) ?? new Set<string>();
              set.add(r.google_place_id);
              merchantToGoogle.set(r.merchant_id, set);
            }
          })
      : Promise.resolve();

  // 3. Live challenges geolocated by lat/lng, for the proximity match.
  const proximityTask = anyPlaceHasCoords
    ? client
        .from("challenges")
        .select("latitude, longitude")
        .eq("status", "live")
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .then(({ data }) => {
          for (const row of data ?? []) {
            const r = row as { latitude?: number; longitude?: number };
            if (typeof r.latitude === "number" && typeof r.longitude === "number") {
              liveChallengePoints.push({ lat: r.latitude, lng: r.longitude });
            }
          }
        })
    : Promise.resolve();

  await Promise.all([pinnedTask, matchingBusinessesTask, proximityTask]);

  if (merchantToGoogle.size > 0) {
    const { data } = await client
      .from("challenges")
      .select("merchant_id")
      .eq("status", "live")
      .in("merchant_id", Array.from(merchantToGoogle.keys()));
    for (const row of data ?? []) {
      const m = (row as { merchant_id?: string }).merchant_id;
      if (!m) continue;
      const googleSet = merchantToGoogle.get(m);
      if (!googleSet) continue;
      for (const g of googleSet) matchingGoogleIds.add(g);
    }
  }

  return places.map((p) => {
    const pinned = typeof p.id === "string" && pinnedPlaceIds.has(p.id);
    const byMerchant =
      typeof p.google_place_id === "string" &&
      matchingGoogleIds.has(p.google_place_id);

    let nearby = false;
    if (
      !pinned &&
      !byMerchant &&
      typeof p.latitude === "number" &&
      typeof p.longitude === "number"
    ) {
      const lat = p.latitude;
      const lng = p.longitude;
      nearby = liveChallengePoints.some(
        (pt) => distanceMeters(lat, lng, pt.lat, pt.lng) <= PROXIMITY_METERS,
      );
    }

    return { ...p, has_live_challenges: pinned || byMerchant || nearby };
  });
}
