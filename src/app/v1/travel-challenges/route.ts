import { NextResponse } from "next/server";
import { createApiClient } from "@/lib/supabase/api";

/**
 * GET /v1/travel-challenges?lat=..&lng=..&limit=20&offset=0&max_radius_km=20
 *
 * Returns live travel challenges near a given coordinate. A challenge is
 * only included when the caller falls within its business's own
 * `service_radius_meters` — the radius the merchant configured in
 * Business Profile. The optional `max_radius_km` is a hard ceiling so a
 * misconfigured 100 km business doesn't pollute everyone's home feed
 * (defaults to 20 km).
 *
 * Supports cursor-based pagination via `offset` + `limit`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0") || 0, 0);
  const maxRadiusKm = parseFloat(searchParams.get("max_radius_km") ?? "20");
  const maxRadiusMeters = maxRadiusKm * 1000;

  const supabase = createApiClient(request);

  const { data, error } = await supabase
    .from("travel_challenges")
    .select(
      `id, title, description, cover_url, completion_mode,
       big_reward_title, big_reward_description, big_reward_discount_type,
       big_reward_discount_value, status, created_at,
       business:businesses!travel_challenges_business_id_fkey (
         id, name, city, latitude, longitude, establishment_type, service_radius_meters
       ),
       children:challenges!travel_challenge_id ( id )`
    )
    .eq("status", "live")
    .limit(limit * 3);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    title: string;
    description: string | null;
    cover_url: string | null;
    completion_mode: string;
    big_reward_title: string | null;
    big_reward_description: string | null;
    big_reward_discount_type: string | null;
    big_reward_discount_value: number | null;
    status: string;
    created_at: string;
    business:
      | {
          id: string;
          name: string;
          city: string | null;
          latitude: number | null;
          longitude: number | null;
          establishment_type: string | null;
          service_radius_meters: number | null;
        }
      | null;
    children: { id: string }[] | null;
  };

  const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);

  const ranked = (data ?? []).map((raw) => {
    const r = raw as unknown as Row;
    const blat = r.business?.latitude ?? null;
    const blng = r.business?.longitude ?? null;
    const distance =
      hasCoord && blat != null && blng != null
        ? haversine(lat, lng, blat, blng)
        : null;
    const businessRadius = r.business?.service_radius_meters ?? null;

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      cover_url: r.cover_url,
      completion_mode: r.completion_mode,
      reward_title: r.big_reward_title,
      reward_description: r.big_reward_description,
      reward_discount_type: r.big_reward_discount_type,
      reward_discount_value: r.big_reward_discount_value,
      child_count: r.children?.length ?? 0,
      business_id: r.business?.id ?? null,
      business_name: r.business?.name ?? null,
      city: r.business?.city ?? null,
      latitude: blat,
      longitude: blng,
      establishment_type: r.business?.establishment_type ?? null,
      distance_meters: distance,
      service_radius_meters: businessRadius,
    };
  });

  // A challenge is in-range when the caller falls within the business's
  // own service radius (capped by max_radius_km so a 100 km business
  // doesn't reach into every city). When no coordinate is provided, we
  // return everything so the screen has *something* to show.
  const filtered = hasCoord
    ? ranked.filter((r) => {
        if (r.distance_meters == null) return false;
        const businessRadius = r.service_radius_meters ?? 2000; // default to 2km
        const effectiveRadius = Math.min(businessRadius, maxRadiusMeters);
        return r.distance_meters <= effectiveRadius;
      })
    : ranked;

  filtered.sort((a, b) => {
    const da = a.distance_meters ?? Number.POSITIVE_INFINITY;
    const db = b.distance_meters ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  const page = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    data: page,
    count: page.length,
    total: filtered.length,
    has_more: offset + limit < filtered.length,
  });
}

function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
