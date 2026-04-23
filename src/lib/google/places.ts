/**
 * Google Places API (New) wrapper.
 *
 * Uses the 2023 Places API (`places.googleapis.com/v1/...`) instead of
 * the legacy endpoints (`maps.googleapis.com/maps/api/place/...`) which
 * Google has started disabling for new projects.
 *
 * We proxy Google from the server so the API key is never exposed to
 * the iOS client. Results are normalized to the shape the mobile + admin
 * UIs already consume (matching our internal `places` table) and are
 * upserted back into Supabase so that:
 *   1. Merchants can link a business to a Google place by `google_place_id`.
 *   2. Challenges can reference `places.id` without repeatedly hitting Google.
 *
 * API reference: https://developers.google.com/maps/documentation/places/web-service/nearby-search
 */

export const GOOGLE_NEARBY_URL =
  "https://places.googleapis.com/v1/places:searchNearby";

// The Places API (New) returns a photo resource name which we then turn
// into a media URL the client can hit directly.
export const GOOGLE_PHOTO_MEDIA = (name: string) =>
  `https://places.googleapis.com/v1/${name}/media`;

/** Types the mobile client filters by, mapped to Places API (New) types. */
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
 *  selection used by `/v1/places` and the `places` table. */
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

interface GooglePlaceNew {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  photos?: Array<{ name?: string }>;
  businessStatus?: string;
  addressComponents?: Array<{
    longText?: string;
    shortText?: string;
    types?: string[];
  }>;
}

interface GoogleNearbyResponseNew {
  places?: GooglePlaceNew[];
}

// Field mask tells Google which fields we want back. Billed per field
// class - keep this tight.
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.location",
  "places.types",
  "places.primaryType",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.businessStatus",
  "places.addressComponents",
].join(",");

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  return key;
}

function photoURL(
  photoName: string | undefined,
  maxWidth = 480,
): string | null {
  if (!photoName) return null;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const qs = new URLSearchParams({
    maxWidthPx: String(maxWidth),
    key,
  });
  return `${GOOGLE_PHOTO_MEDIA(photoName)}?${qs.toString()}`;
}

/**
 * Larger photo URL intended for place detail screens. Exported so
 * `/v1/places/[id]` can request a higher-resolution image without
 * inflating list-card responses. Returns `null` when no photo name is
 * provided or the API key is missing.
 */
export function detailPhotoURL(
  photoName: string | undefined,
  maxWidth = 1280,
): string | null {
  return photoURL(photoName, maxWidth);
}

function cityFromComponents(
  components: GooglePlaceNew["addressComponents"],
): string | null {
  if (!components) return null;
  // Places API (New) exposes a `locality` component. Fall back to
  // `administrative_area_level_2` or `administrative_area_level_1`.
  const priority = [
    "locality",
    "administrative_area_level_2",
    "administrative_area_level_1",
  ];
  for (const level of priority) {
    const match = components.find((c) => c.types?.includes(level));
    if (match?.longText) return match.longText;
  }
  return null;
}

function categoryFromTypes(
  primary: string | undefined,
  types: string[] | undefined,
): string | null {
  const all = [primary, ...(types ?? [])].filter(
    (t): t is string => typeof t === "string",
  );
  if (all.length === 0) return null;
  const readable = all.find(
    (t) =>
      ![
        "point_of_interest",
        "establishment",
        "food",
        "store",
      ].includes(t),
  );
  return (readable ?? all[0]).replace(/_/g, " ");
}

function normalize(result: GooglePlaceNew): NormalizedPlace | null {
  const lat = result.location?.latitude;
  const lng = result.location?.longitude;
  if (lat == null || lng == null) return null;
  if (result.businessStatus && result.businessStatus !== "OPERATIONAL")
    return null;

  return {
    // Before the upsert mirrors into Supabase the id is the Google place id.
    // `mirrorPlaces` replaces this with the Supabase UUID.
    id: result.id,
    name: result.displayName?.text ?? "Unnamed place",
    description:
      result.shortFormattedAddress ?? result.formattedAddress ?? null,
    latitude: lat,
    longitude: lng,
    category: categoryFromTypes(result.primaryType, result.types),
    image_url: photoURL(result.photos?.[0]?.name),
    city: cityFromComponents(result.addressComponents),
    rating: typeof result.rating === "number" ? result.rating : null,
    user_ratings_total:
      typeof result.userRatingCount === "number" ? result.userRatingCount : null,
    google_place_id: result.id,
  };
}

/**
 * Runs a Google `places:searchNearby` request centered on a coordinate.
 * Pass one or more establishment types to filter; an empty list returns
 * a general mix (Google returns POIs when no type is specified).
 *
 * `rankPreference` controls whether results come back distance-sorted
 * or popularity-sorted. Google does not expose a "trending" signal
 * directly - we approximate it by asking for POPULARITY then re-sorting
 * in `sortByTrending`.
 */
export async function googleNearby({
  latitude,
  longitude,
  radiusMeters = 5_000,
  types,
  rankByDistance = false,
  maxResults = 20,
}: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  types?: EstablishmentType[];
  rankByDistance?: boolean;
  maxResults?: number;
}): Promise<NormalizedPlace[]> {
  const key = apiKey();
  const googleTypes = Array.from(
    new Set(
      (types ?? []).map((t) => GOOGLE_TYPE_FOR_ESTABLISHMENT[t]).filter(Boolean),
    ),
  );

  const body = {
    includedTypes: googleTypes.length > 0 ? googleTypes : undefined,
    maxResultCount: Math.min(Math.max(maxResults, 1), 20),
    rankPreference: rankByDistance ? "DISTANCE" : "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude, longitude },
        radius: Math.min(Math.max(radiusMeters, 100), 50_000),
      },
    },
  };

  const response = await fetch(GOOGLE_NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    // Vercel edge cache - 5m per query is enough for an MVP.
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `google_places_new_http_${response.status}: ${text.slice(0, 200)}`,
    );
  }
  const json = (await response.json()) as GoogleNearbyResponseNew;
  return (json.places ?? [])
    .map(normalize)
    .filter((p): p is NormalizedPlace => p !== null);
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
