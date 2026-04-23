import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  googleNearby,
  sortByTrending,
  type EstablishmentType,
  type NormalizedPlace,
} from "@/lib/google/places";
import { mirrorPlaces } from "@/lib/google/placesCache";

export const dynamic = "force-dynamic";

const VALID_ESTABLISHMENTS: EstablishmentType[] = [
  "restaurant",
  "cafe",
  "hotel",
  "motel",
  "adventure",
  "landmark",
  "shopping",
  "entertainment",
];

function parseTypes(raw: string | null): EstablishmentType[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t): t is EstablishmentType =>
      VALID_ESTABLISHMENTS.includes(t as EstablishmentType),
    );
}

/**
 * `/v1/places` - discovery endpoint powering the home screen.
 *
 *   mode=nearby   (default when lat/lng given) - establishments near the
 *                 user sorted by distance via Google rankby=distance
 *   mode=trending (top 3 by rating*popularity) - same dataset but sorted
 *                 by a log-damped rating score
 *   mode=db       - legacy path for admin tooling, reads the `places`
 *                 table directly
 *
 * When Google is used, we mirror results into our `places` table
 * (upsert by `google_place_id`) so merchants can link businesses and we
 * avoid paying Google per request.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "").toLowerCase();
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const lat = latParam ? Number(latParam) : null;
  const lng = lngParam ? Number(lngParam) : null;
  const types = parseTypes(searchParams.get("types"));
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 20), 1),
    50,
  );

  const wantsGoogle =
    mode === "nearby" || mode === "trending" || (mode === "" && lat != null && lng != null);

  if (wantsGoogle && lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    try {
      const raw = await googleNearby({
        latitude: lat,
        longitude: lng,
        types: types.length > 0 ? types : undefined,
        rankByDistance: mode !== "trending",
      });

      // Mirror to our DB so downstream calls can resolve by UUID.
      const mirrored = await mirrorPlaces(raw);

      const sorted: NormalizedPlace[] =
        mode === "trending"
          ? sortByTrending(mirrored)
          : mirrored;

      return NextResponse.json({
        data: sorted.slice(0, limit),
        count: sorted.length,
        source: "google",
      });
    } catch (error) {
      console.error("google nearby failed, falling back to db:", error);
      // fall through to the DB path below
    }
  }

  // DB fallback / admin usage.
  const supabase = await createClient();
  const city = searchParams.get("city");
  const category = searchParams.get("category");

  let query = supabase
    .from("places")
    .select(
      "id, name, description, latitude, longitude, category, image_url, city, rating, user_ratings_total, google_place_id",
    )
    .eq("is_active", true)
    .limit(limit);

  if (city) query = query.eq("city", city);
  if (category) query = query.eq("category", category);
  query = query.order("rating", { ascending: false, nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    count: data?.length ?? 0,
    source: "db",
  });
}
