import { createAdminClient } from "@/lib/supabase/admin";
import type { NormalizedPlace } from "./places";

/**
 * Mirrors Google Places results into our own `places` table so that:
 *   - each place has a stable Supabase UUID the app and merchants can use,
 *   - future queries hit Postgres instead of paying Google per request,
 *   - merchants can attach businesses/challenges to these places by UUID.
 *
 * Upsert by `google_place_id` (unique index). Missing rows are inserted;
 * existing rows keep their UUID but get refreshed metadata.
 */
export async function mirrorPlaces(
  places: NormalizedPlace[],
): Promise<NormalizedPlace[]> {
  if (places.length === 0) return places;
  const admin = createAdminClient();

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
