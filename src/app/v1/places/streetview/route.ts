import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /v1/places/streetview?lat=..&lng=..&w=640&h=320
 *
 * Thin server-side proxy to the Google Street View Static API. Used as
 * the hero image on a quest stop's detail card so the traveler sees the
 * actual road / storefront near the pin instead of a flat gradient.
 *
 * Keeps GOOGLE_MAPS_API_KEY server-side (never shipped in the iOS
 * bundle for this purpose). Two-step:
 *   1. Hit the (free) Street View metadata endpoint to check whether
 *      imagery exists at this coordinate.
 *   2. If yes -> return the Street View image.
 *      If no  -> fall back to the Static Maps roadmap image so the card
 *                still shows a real geographic image, never a blank.
 *
 * Returns 503 when maps aren't configured so the client can fall back
 * to its local gradient.
 */
export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return new NextResponse("maps not configured", { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new NextResponse("lat/lng required", { status: 400 });
  }

  const width = clamp(Number(searchParams.get("w") ?? 640), 100, 640);
  const height = clamp(Number(searchParams.get("h") ?? 320), 100, 640);

  const hasStreetView = await streetViewAvailable(lat, lng, key);

  const upstreamUrl = hasStreetView
    ? streetViewUrl(lat, lng, width, height, key)
    : staticMapUrl(lat, lng, width, height, key);

  const response = await fetch(upstreamUrl, { cache: "no-store" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(
      "[/v1/places/streetview] upstream failed:",
      response.status,
      text.slice(0, 200)
    );
    return new NextResponse("image fetch failed", { status: 502 });
  }

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
      // Street view for a coordinate is stable; cache hard so cold-launch
      // waves don't hammer Google. The pin's lat/lng is the cache key.
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      // Tells the client which source it got, handy for debugging.
      "X-Image-Source": hasStreetView ? "streetview" : "staticmap",
    },
  });
}

/**
 * Free metadata probe - returns true only when Google has Street View
 * imagery for (lat,lng). Avoids charging for / returning the grey
 * "no imagery available" placeholder.
 */
async function streetViewAvailable(
  lat: number,
  lng: number,
  key: string
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      location: `${lat},${lng}`,
      key,
      source: "outdoor",
    });
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?${params.toString()}`,
      { cache: "no-store" }
    );
    if (!res.ok) return false;
    const json = (await res.json()) as { status?: string };
    return json.status === "OK";
  } catch {
    return false;
  }
}

function streetViewUrl(
  lat: number,
  lng: number,
  width: number,
  height: number,
  key: string
): string {
  const params = new URLSearchParams({
    size: `${width}x${height}`,
    location: `${lat},${lng}`,
    fov: "80",
    pitch: "0",
    source: "outdoor",
    return_error_code: "true",
    key,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params.toString()}`;
}

function staticMapUrl(
  lat: number,
  lng: number,
  width: number,
  height: number,
  key: string
): string {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: "16",
    size: `${width}x${height}`,
    scale: "2",
    maptype: "roadmap",
    markers: `color:red|${lat},${lng}`,
    key,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}
