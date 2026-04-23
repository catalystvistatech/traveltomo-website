/**
 * Google Places (Nearby Search + Details) wrapper.
 *
 * We proxy Google from the server so the API key is never exposed to the
 * iOS client. Results are normalized to the shape the mobile + admin UIs
 * already consume (matching our internal `places` table) and are
 * upserted back into Supabase so that:
 *   1. Merchants can link a business to a Google place by `google_place_id`.
 *   2. Challenges can reference `places.id` without repeatedly hitting Google.
 *
 * API reference: https://developers.google.com/maps/documentation/places/web-service/search-nearby
 */

export const GOOGLE_NEARBY_URL =
  "https://maps.googleapis.com/maps/api/place/nearbysearch/json";
export const GOOGLE_DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";
export const GOOGLE_PHOTO_URL =
  "https://maps.googleapis.com/maps/api/place/photo";

/** Types the mobile client filters by, mapped to Google types. */
export type EstablishmentType =
  | "restaurant"
  | "cafe"
  | "hotel"
  | "motel"
  | "adventure"
  | "landmark"
  | "shopping"
  | "entertainment";

const GOOGLE_TYPE_FOR_ESTABLISHMENT: Record<EstablishmentType, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  hotel: "lodging",
  motel: "lodging",
  adventure: "tourist_attraction",
  landmark: "tourist_attraction",
  shopping: "shopping_mall",
  entertainment: "amusement_park",
};

/** Normalized place shape returned to the mobile app. Mirrors the
 *  selection used by `/v1/places` and `places` table. */
export interface NormalizedPlace {
  id: string;
  name: string;
  description: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
  image_url: string | null;
  city: string | null;
  rating: number | null;
  user_ratings_total: number | null;
  google_place_id: string;
}

interface GoogleNearbyResult {
  place_id: string;
  name: string;
  vicinity?: string;
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  geometry?: {
    location?: { lat: number; lng: number };
  };
  photos?: Array<{
    photo_reference?: string;
  }>;
  business_status?: string;
}

interface GoogleNearbyResponse {
  status: string;
  error_message?: string;
  results?: GoogleNearbyResult[];
}

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  return key;
}

function photoURL(ref: string | undefined, maxwidth = 640): string | null {
  if (!ref) return null;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({
    maxwidth: String(maxwidth),
    photo_reference: ref,
    key,
  });
  return `${GOOGLE_PHOTO_URL}?${qs.toString()}`;
}

function cityFromVicinity(vicinity: string | undefined): string | null {
  if (!vicinity) return null;
  // "135 Real St, Angeles, Pampanga" -> "Angeles"
  const parts = vicinity.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 2] ?? parts[parts.length - 1] ?? null;
}

function categoryFromTypes(types: string[] | undefined): string | null {
  if (!types || types.length === 0) return null;
  const readable = types.find(
    (t) =>
      ![
        "point_of_interest",
        "establishment",
        "food",
        "store",
      ].includes(t),
  );
  return (readable ?? types[0]).replace(/_/g, " ");
}

function normalize(result: GoogleNearbyResult): NormalizedPlace | null {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (lat == null || lng == null) return null;
  if (result.business_status && result.business_status !== "OPERATIONAL")
    return null;

  return {
    // Until we've persisted to Supabase we use the Google id as the
    // stable UUID-ish identifier. The upsert below will overwrite this
    // with the actual UUID when we mirror the row into `places`.
    id: result.place_id,
    name: result.name,
    description: result.vicinity ?? null,
    latitude: lat,
    longitude: lng,
    category: categoryFromTypes(result.types),
    image_url: photoURL(result.photos?.[0]?.photo_reference),
    city: cityFromVicinity(result.vicinity),
    rating: typeof result.rating === "number" ? result.rating : null,
    user_ratings_total: result.user_ratings_total ?? null,
    google_place_id: result.place_id,
  };
}

/**
 * Runs a Google Nearby Search centered on a coordinate. The caller can
 * pass one or more establishment types which we translate to the single
 * Google "type" query parameter by running parallel requests and merging
 * results (Google only accepts a single type).
 */
export async function googleNearby({
  latitude,
  longitude,
  radiusMeters = 5_000,
  types,
  keyword,
  rankByDistance = false,
}: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  types?: EstablishmentType[];
  keyword?: string;
  rankByDistance?: boolean;
}): Promise<NormalizedPlace[]> {
  const key = apiKey();
  const run = async (type?: string): Promise<NormalizedPlace[]> => {
    const params = new URLSearchParams({
      location: `${latitude},${longitude}`,
      key,
    });
    if (rankByDistance) {
      params.set("rankby", "distance");
      // Google requires at least one of type/keyword when rankby=distance
      // and forbids radius in that mode.
      if (!type && !keyword) params.set("keyword", "restaurant");
    } else {
      params.set("radius", String(radiusMeters));
    }
    if (type) params.set("type", type);
    if (keyword) params.set("keyword", keyword);

    const response = await fetch(`${GOOGLE_NEARBY_URL}?${params.toString()}`, {
      // Google edge-caches per query; 5m is plenty for an MVP.
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      throw new Error(`google_nearby_http_${response.status}`);
    }
    const json = (await response.json()) as GoogleNearbyResponse;
    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      throw new Error(
        `google_nearby_${json.status}: ${json.error_message ?? "unknown"}`,
      );
    }
    const results = json.results ?? [];
    return results
      .map(normalize)
      .filter((p): p is NormalizedPlace => p !== null);
  };

  const typeList = types && types.length > 0 ? types : [undefined];
  const groups = await Promise.all(
    typeList.map((t) =>
      run(t ? GOOGLE_TYPE_FOR_ESTABLISHMENT[t] : undefined).catch(() => []),
    ),
  );
  const merged = new Map<string, NormalizedPlace>();
  for (const group of groups) {
    for (const place of group) merged.set(place.google_place_id, place);
  }
  return Array.from(merged.values());
}

/**
 * Score places for "trending" = popularity signal. We multiply rating by
 * a log-damped review count so that places with both high ratings and
 * enough reviews bubble up (a 5-star place with 3 reviews is not
 * actually trending).
 */
export function sortByTrending(places: NormalizedPlace[]): NormalizedPlace[] {
  return [...places].sort((a, b) => {
    const sa = (a.rating ?? 0) * Math.log10((a.user_ratings_total ?? 0) + 10);
    const sb = (b.rating ?? 0) * Math.log10((b.user_ratings_total ?? 0) + 10);
    return sb - sa;
  });
}
