import { NextResponse } from "next/server";
import { GOOGLE_PLACE_ID_RE } from "@/lib/google/photo-url";

export const dynamic = "force-dynamic";

/**
 * GET /v1/places/photo?gid=<google place id>&w=480
 *
 * Redirects to the place's current Google photo. Google photo references
 * expire, so stored links went dead and cards fell back to the plain blue
 * backdrop. This resolves a fresh reference on demand (Place Details →
 * photo media with skipHttpRedirect, which returns a keyless
 * googleusercontent URL) and lets the CDN cache the redirect for a day.
 *
 * 404 when the place has no photo, so clients show their own fallback.
 */
export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return new NextResponse("maps not configured", { status: 503 });

  const { searchParams } = new URL(request.url);
  const gid = searchParams.get("gid") ?? "";
  if (!GOOGLE_PLACE_ID_RE.test(gid)) return new NextResponse("gid required", { status: 400 });
  const width = clamp(Number(searchParams.get("w") ?? 480), 100, 1600);

  try {
    const details = await fetch(`https://places.googleapis.com/v1/places/${gid}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "photos" },
      next: { revalidate: 86_400 },
    });
    if (!details.ok) return notFound();
    const photoName = ((await details.json()) as { photos?: { name?: string }[] }).photos?.[0]?.name;
    if (!photoName) return notFound();

    const qs = new URLSearchParams({ maxWidthPx: String(width), skipHttpRedirect: "true", key });
    const media = await fetch(`https://places.googleapis.com/v1/${photoName}/media?${qs.toString()}`, {
      next: { revalidate: 86_400 },
    });
    if (!media.ok) return notFound();
    const photoUri = ((await media.json()) as { photoUri?: string }).photoUri;
    if (!photoUri?.startsWith("https://")) return notFound();

    return NextResponse.redirect(photoUri, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400" },
    });
  } catch (err) {
    console.error("[/v1/places/photo] lookup failed:", err);
    return new NextResponse("photo lookup failed", { status: 502 });
  }
}

function notFound() {
  // Cache misses too, so a photo-less place doesn't cost a lookup per view.
  return new NextResponse("no photo", { status: 404, headers: { "Cache-Control": "public, s-maxage=86400" } });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}
