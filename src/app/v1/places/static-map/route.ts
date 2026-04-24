import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /v1/places/static-map?lat=..&lng=..&zoom=15&w=640&h=240
 *
 * Thin server-side proxy to the Google Static Maps API. Keeps the
 * `GOOGLE_MAPS_API_KEY` on the server (Vercel redirects/rewrites can't
 * be trusted with credentials) and lets us enforce sane zoom/size
 * caps. Returns the PNG body with the same content-type Google sends.
 *
 * Used by the merchant business location picker to render a preview
 * centered on the currently-selected business.
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

  const zoom = clamp(Number(searchParams.get("zoom") ?? 15), 8, 20);
  const width = clamp(Number(searchParams.get("w") ?? 640), 100, 640);
  const height = clamp(Number(searchParams.get("h") ?? 240), 100, 640);

  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${width}x${height}`,
    scale: "2",
    maptype: "roadmap",
    markers: `color:red|${lat},${lng}`,
    key,
  });

  const url = `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("[/v1/places/static-map] upstream failed:", response.status, text.slice(0, 200));
    return new NextResponse("map fetch failed", { status: 502 });
  }

  const buffer = await response.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}
