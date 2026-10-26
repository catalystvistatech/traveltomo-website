// Google Places photo links ("places/{id}/photos/{ref}/media?key=…") stop
// working after a while, and they carry the server API key. We store and
// return our own /v1/places/photo?gid=… link instead, which looks up the
// place's current photo every time Google rotates it.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app";

const GOOGLE_MEDIA_RE = /^https:\/\/places\.googleapis\.com\/v1\/places\/([A-Za-z0-9_-]+)\/photos\/[^?]+\/media(?:\?.*)?$/;

export const GOOGLE_PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;

/** Stable photo link for a Google place id. */
export function placePhotoUrl(googlePlaceId: string, maxWidth = 480): string {
  const qs = new URLSearchParams({ gid: googlePlaceId, w: String(maxWidth) });
  return `${SITE_URL}/v1/places/photo?${qs.toString()}`;
}

/** Swaps a stored Google photo link for the stable one; other URLs pass through. */
export function freshPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  const m = GOOGLE_MEDIA_RE.exec(url);
  return m ? placePhotoUrl(m[1]) : url;
}

/**
 * Rewrites every Google photo link anywhere in an API payload. Rows from
 * before the switch still hold the old links, so routes run their response
 * through this rather than patching each image field by hand.
 */
export function withFreshPhotos<T>(data: T): T {
  if (typeof data === "string") return freshPhotoUrl(data) as T;
  if (Array.isArray(data)) return data.map(withFreshPhotos) as T;
  if (data && typeof data === "object" && Object.getPrototypeOf(data) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) out[k] = withFreshPhotos(v);
    return out as T;
  }
  return data;
}
