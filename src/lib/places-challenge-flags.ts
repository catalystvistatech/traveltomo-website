import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Annotates a page of place rows with a boolean indicating whether the
 * place currently has at least one live challenge associated with it.
 * Powers the small red dot on Home/place cards so travelers can see at
 * a glance which destinations have something to do.
 *
 * A challenge counts as "associated" with a place when either:
 *   - challenges.place_id == place.id (direct pin), OR
 *   - challenges.merchant_id == businesses.merchant_id AND
 *     businesses.google_place_id == place.google_place_id
 *     (merchant business linked to the same Google POI).
 *
 * No PostgREST embed across challenges/businesses - there is no direct
 * FK (`challenges.merchant_id -> profiles.id`, same for businesses), so
 * we resolve in three small flat queries instead.
 */
export async function annotateHasLiveChallenges<
  T extends {
    id?: string | null;
    google_place_id?: string | null;
  }
>(client: SupabaseClient, places: T[]): Promise<(T & { has_live_challenges: boolean })[]> {
  if (places.length === 0) return [];

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

  const pinnedPlaceIds = new Set<string>();
  const matchingGoogleIds = new Set<string>();

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

  await Promise.all([pinnedTask, matchingBusinessesTask]);

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

  return places.map((p) => ({
    ...p,
    has_live_challenges:
      (typeof p.id === "string" && pinnedPlaceIds.has(p.id)) ||
      (typeof p.google_place_id === "string" &&
        matchingGoogleIds.has(p.google_place_id)),
  }));
}
