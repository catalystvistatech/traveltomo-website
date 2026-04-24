import { NextResponse } from "next/server";
import { createClient as createCookieClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/api";
import { googleTextSearch } from "@/lib/google/places";

export const dynamic = "force-dynamic";

/**
 * GET /v1/places/autocomplete?q=...&lat=...&lng=...
 *
 * Server-side proxy to Google Places (New) `places:searchText`. Backs
 * the merchant business location picker on the admin dashboard and can
 * be reused by the iOS app in the future. The API key stays on the
 * server; callers only receive normalised predictions.
 *
 * Auth: accepts either a dashboard cookie session (admin UI) OR a
 * Bearer token (iOS). Anonymous requests are rejected so we don't get
 * billed by unauthenticated spam.
 */
export async function GET(request: Request) {
  const authed = await isAuthenticated(request);
  if (!authed) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  if (query.length < 2) {
    return NextResponse.json({ data: [] });
  }

  const latRaw = searchParams.get("lat");
  const lngRaw = searchParams.get("lng");
  const lat = latRaw != null ? Number(latRaw) : null;
  const lng = lngRaw != null ? Number(lngRaw) : null;

  try {
    const places = await googleTextSearch({
      query,
      latitude: lat != null && Number.isFinite(lat) ? lat : null,
      longitude: lng != null && Number.isFinite(lng) ? lng : null,
      maxResults: 5,
    });

    const predictions = places.map((p) => ({
      placeId: p.google_place_id,
      name: p.name,
      address: p.description,
      city: p.city,
      lat: p.latitude,
      lng: p.longitude,
      category: p.category,
    }));

    return NextResponse.json({ data: predictions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[/v1/places/autocomplete] google_failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * True when the caller has either a valid dashboard cookie session
 * (admin UI usage) or a Bearer access token (iOS). Either path proves
 * the caller is a logged-in TravelTomo account.
 */
async function isAuthenticated(request: Request): Promise<boolean> {
  const bearer = request.headers.get("authorization");
  if (bearer) {
    const { user } = await requireUser(request);
    if (user) return true;
  }

  try {
    const supabase = await createCookieClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user != null;
  } catch {
    return false;
  }
}
