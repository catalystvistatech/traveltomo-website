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

/** Text search (New) — find establishments by name or address. */
export const GOOGLE_SEARCH_TEXT_URL =
  "https://places.googleapis.com/v1/places:searchText";

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

// ---------------------------------------------------------------------------
// 3-layer quality filter
// ---------------------------------------------------------------------------

/**
 * Layer 1 – allowlist.
 *
 * When no explicit EstablishmentType filter comes from the client we pass
 * ONLY these types as `includedTypes` so Google never returns mundane
 * micro-businesses in the first place. This is cheaper and more precise
 * than maintaining a long excludedTypes list.
 */
const ALLOWED_NEARBY_TYPES = [
  "restaurant",
  "cafe",
  "tourist_attraction",
  "museum",
  "lodging",
  "park",
  "bar",
  "shopping_mall",
  "art_gallery",
];

/**
 * Layer 2 – name-based exclusions (post-filter).
 *
 * Google has no server-side name filter, so we strip out local micro-stores
 * by matching against common Filipino and generic informal-store keywords.
 */
const NAME_EXCLUSION_PATTERNS: RegExp[] = [
  /sari[-\s]?sari/i,
  /mini[-\s]?store/i,
  /tindahan/i,
  /\bpalengke\b/i,
  /\bpabrika\b/i,
  /\bcarinderia\b/i,
];

/** Layer 3 thresholds – minimum quality bar for any result to surface. */
const QUALITY_MIN_REVIEWS = 5;
const QUALITY_MIN_RATING = 3.8;

/**
 * Runs a Google `places:searchNearby` request centered on a coordinate.
 *
 * Three-layer quality filtering is applied to every response:
 *
 *   Layer 1 – allowlist: when no explicit type filter is provided we send
 *             only travel-relevant `includedTypes` so Google never returns
 *             mundane micro-businesses in the first place.
 *
 *   Layer 2 – name exclusions: strips common informal-store keywords
 *             (sari-sari, mini store, tindahan …) that occasionally slip
 *             through the type filter.
 *
 *   Layer 3 – quality gate: minimum reviews, rating, and photo presence
 *             ensure only established, well-documented venues surface.
 *
 * @param minRatingCount  Override the Layer-3 review floor. Callers that
 *                        want a stricter bar (e.g. trending = 20) can raise
 *                        it; passing 0 disables the check entirely.
 */
export async function googleNearby({
  latitude,
  longitude,
  radiusMeters = 5_000,
  types,
  minRatingCount = QUALITY_MIN_REVIEWS,
  maxResults = 20,
}: {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  types?: EstablishmentType[];
  /** Minimum number of Google reviews. Defaults to QUALITY_MIN_REVIEWS (5). */
  minRatingCount?: number;
  maxResults?: number;
}): Promise<NormalizedPlace[]> {
  const key = apiKey();

  // Map caller-supplied EstablishmentType values to Google type strings.
  const requestedGoogleTypes = Array.from(
    new Set(
      (types ?? []).map((t) => GOOGLE_TYPE_FOR_ESTABLISHMENT[t]).filter(Boolean),
    ),
  );

  const body: Record<string, unknown> = {
    maxResultCount: Math.min(Math.max(maxResults, 1), 20),
    // Always popularity — closest-first surfaces micro-businesses over icons.
    rankPreference: "POPULARITY",
    locationRestriction: {
      circle: {
        center: { latitude, longitude },
        radius: Math.min(Math.max(radiusMeters, 100), 50_000),
      },
    },
  };

  if (requestedGoogleTypes.length > 0) {
    // Client specified a type filter — honour it exactly.
    body.includedTypes = requestedGoogleTypes;
  } else {
    // Layer 1: no filter → constrain to the travel-relevant allowlist.
    body.includedTypes = ALLOWED_NEARBY_TYPES;
  }

  const response = await fetch(GOOGLE_NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
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
    // Keep only successfully normalized entries.
    .filter((p): p is NormalizedPlace => p !== null)
    // Layer 2: strip informal-store names that slip through the type allowlist.
    .filter((p) => !NAME_EXCLUSION_PATTERNS.some((rx) => rx.test(p.name)))
    // Layer 3a: minimum review count.
    .filter((p) =>
      minRatingCount > 0
        ? (p.user_ratings_total ?? 0) >= minRatingCount
        : true,
    )
    // Layer 3b: minimum rating.
    .filter((p) => (p.rating ?? 0) >= QUALITY_MIN_RATING)
    // Layer 3c: must have at least one photo.
    .filter((p) => p.image_url !== null);
}

interface GoogleSearchTextResponseNew {
  places?: GooglePlaceNew[];
}

/**
 * Google `places:searchText` — merchant-facing business lookup by name
 * or address. Optional lat/lng bias improves local relevance.
 */
export async function googleTextSearch({
  query,
  latitude,
  longitude,
  radiusMeters = 50_000,
  maxResults = 5,
}: {
  query: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number;
  maxResults?: number;
}): Promise<NormalizedPlace[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = apiKey();
  const body: Record<string, unknown> = {
    textQuery: trimmed,
    maxResultCount: Math.min(Math.max(maxResults, 1), 20),
  };

  if (
    latitude != null &&
    longitude != null &&
    !Number.isNaN(latitude) &&
    !Number.isNaN(longitude)
  ) {
    body.locationBias = {
      circle: {
        center: { latitude, longitude },
        radius: Math.min(Math.max(radiusMeters, 100), 50_000),
      },
    };
  }

  const response = await fetch(GOOGLE_SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `google_places_search_text_${response.status}: ${text.slice(0, 200)}`,
    );
  }

  const json = (await response.json()) as GoogleSearchTextResponseNew;
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
