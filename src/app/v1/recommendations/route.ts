import { NextResponse } from "next/server";
import { createApiClient } from "@/lib/supabase/api";

/**
 * GET /v1/recommendations?lat=..&lng=..&types=restaurant,cafe&limit=50
 *
 * Returns live, approved challenges whose merchant is currently open and
 * actively promoted, ranked by distance from the user. Types filter the
 * establishment category. This is what the iOS dice/roll flow should call.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const types = (searchParams.get("types") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 }
    );
  }

  const supabase = createApiClient(request);

  let query = supabase
    .from("recommended_challenges")
    .select("*")
    .limit(limit * 3); // fetch wider so distance filter has room

  if (types.length > 0) {
    query = query.in("establishment_type", types);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string;
    latitude: number | null;
    longitude: number | null;
    radius_meters?: number | null;
    service_radius_meters?: number | null;
  } & Record<string, unknown>;

  const withDistance = (data ?? []).map((raw) => {
    const r = raw as Row;
    if (r.latitude == null || r.longitude == null) {
      return { ...r, distance_meters: null };
    }
    return { ...r, distance_meters: haversine(lat, lng, r.latitude, r.longitude) };
  });

  withDistance.sort((a, b) => {
    const da = a.distance_meters ?? Number.POSITIVE_INFINITY;
    const db = b.distance_meters ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  return NextResponse.json({
    data: withDistance.slice(0, limit),
    count: Math.min(withDistance.length, limit),
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
