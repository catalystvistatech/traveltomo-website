import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  googleNearby,
  sortByTrending,
  type EstablishmentType,
  type NormalizedPlace,
} from "@/lib/google/places";
import {
  DEFAULT_CACHE_TTL_HOURS,
  lookupCachedPlaces,
  mirrorPlaces,
} from "@/lib/google/placesCache";

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
    20,
  );
  const offsetRaw = Number(searchParams.get("offset") ?? 0);
  const offset = Math.min(
    Math.max(Number.isFinite(offsetRaw) ? Math.trunc(offsetRaw) : 0, 0),
    1000,
  );

  const wantsGoogle =
    mode === "nearby" || mode === "trending" || (mode === "" && lat != null && lng != null);

  let googleError: string | null = null;
  if (wantsGoogle && lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)) {
    // ────────── Cache fast-path ──────────
    //
    // Before paying Google, check whether we already have a sufficient
    // pool of fresh / prewarmed places mirrored for this area. POIs
    // drift on the order of weeks, so a 24-hour TTL (overridable via
    // PLACES_CACHE_TTL_HOURS) typically catches 90%+ of requests with
    // no measurable UX regression.
    try {
      const cached = await lookupCachedPlaces({
        latitude: lat,
        longitude: lng,
        radiusMeters: 5_000,
        ttlHours: DEFAULT_CACHE_TTL_HOURS,
        // Trending wants a wider pool to sort meaningfully; nearby
        // only needs enough rows to fill a few cards.
        minResults: mode === "trending" ? 10 : 6,
      });

      if (cached.length > 0) {
        const sorted: NormalizedPlace[] =
          mode === "trending" ? sortByTrending(cached) : sortByDistance(cached, lat, lng);
        const page = sorted.slice(offset, offset + limit);
        const hasMore = offset + limit < sorted.length;

        return NextResponse.json(
          {
            data: page,
            count: page.length,
            total: sorted.length,
            offset,
            has_more: hasMore,
            source: "cache",
            cache_ttl_hours: DEFAULT_CACHE_TTL_HOURS,
          },
          {
            headers: {
              "Cache-Control":
                "public, s-maxage=120, stale-while-revalidate=3600",
              Vary: "Authorization",
            },
          },
        );
      }
    } catch (cacheError) {
      // Cache failure is non-fatal -- fall through to Google.
      console.warn(
        `[/v1/places] cache lookup failed, falling back to google:`,
        cacheError instanceof Error ? cacheError.message : String(cacheError),
      );
    }

    // ────────── Google fallback ──────────
    try {
      const raw = await googleNearby({
        latitude: lat,
        longitude: lng,
        types: types.length > 0 ? types : undefined,
        // Trending raises the review floor so only well-known venues surface.
        // Nearby uses the default (5) so smaller areas still get results.
        minRatingCount: mode === "trending" ? 20 : undefined,
      });

      // Mirror to our DB so downstream calls can resolve by UUID and
      // future requests in this area hit the cache instead of Google.
      const mirrored = await mirrorPlaces(raw, { source: "google_nearby" });

      const sorted: NormalizedPlace[] =
        mode === "trending"
          ? sortByTrending(mirrored)
          : sortByDistance(mirrored, lat, lng);

      const page = sorted.slice(offset, offset + limit);
      const hasMore = offset + limit < sorted.length;

      return NextResponse.json(
        {
          data: page,
          count: page.length,
          total: sorted.length,
          offset,
          has_more: hasMore,
          source: "google",
        },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=120, stale-while-revalidate=3600",
            Vary: "Authorization",
          },
        },
      );
    } catch (error) {
      googleError = error instanceof Error ? error.message : String(error);
      // Log with enough context to diagnose from Vercel function logs.
      console.error(
        `[/v1/places] mode=${mode} lat=${lat} lng=${lng} google failed:`,
        googleError,
      );
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
    ...(googleError ? { google_error: googleError } : {}),
  });
}

/**
 * Re-sort cache hits by distance from the caller so the home feed
 * still matches the "rankby distance" ordering travelers expect from
 * the nearby tab. Trending uses its own popularity sort upstream.
 */
function sortByDistance(
  places: NormalizedPlace[],
  lat: number,
  lng: number,
): NormalizedPlace[] {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const distance = (p: NormalizedPlace) => {
    const dLat = toRad(p.latitude - lat);
    const dLng = toRad(p.longitude - lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(p.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  return [...places].sort((a, b) => distance(a) - distance(b));
}
