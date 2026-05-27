import { NextResponse } from "next/server";
import { createApiClient, requireUser } from "@/lib/supabase/api";
import {
  derivePlayerStopStatus,
  isChallengeExcludedFromNearbyPool,
} from "@/lib/challenge-progress";

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
  const auth = await requireUser(request);

  // Persist the caller's last-known location for the
  // `challenge_unlocked` notification trigger (migration 028) and run
  // the unseen-quest backfill sweep (migration 029) so the user picks
  // up notifications for travel challenges that went live BEFORE the
  // trigger existed. Failures are swallowed - we never want a
  // location persist or notification fan-out hiccup to take down the
  // recommendations response.
  if (auth.user) {
    const userId = auth.user.id;
    const client = auth.client;
    void (async () => {
      const { error: touchError } = await client.rpc("touch_user_location", {
        p_user: userId,
        p_lat: lat,
        p_lng: lng,
      });
      if (touchError) {
        console.warn("touch_user_location failed", touchError.message);
        return;
      }
      const { error: sweepError } = await client.rpc(
        "notify_user_of_unseen_nearby_quests",
        { p_user: userId, p_lat: lat, p_lng: lng }
      );
      if (sweepError) {
        console.warn(
          "notify_user_of_unseen_nearby_quests failed",
          sweepError.message
        );
      }
    })();
  }

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
    business_latitude?: number | null;
    business_longitude?: number | null;
  } & Record<string, unknown>;

  // For each challenge, distance is measured from the BUSINESS location
  // (where the merchant actually serves customers), not the challenge
  // pin — a stop can be a remote landmark, but the business radius is
  // what governs whether a traveler is in scope.
  const withDistance = (data ?? []).map((raw) => {
    const r = raw as Row;
    const refLat = r.business_latitude ?? r.latitude;
    const refLng = r.business_longitude ?? r.longitude;
    if (refLat == null || refLng == null) {
      return { ...r, distance_meters: null };
    }
    return {
      ...r,
      distance_meters: haversine(lat, lng, refLat, refLng),
    };
  });

  // Only return challenges whose business radius covers the caller.
  // Cap at 20 km so a single misconfigured radius can't reach across
  // the country.
  const MAX_RADIUS_M = 20_000;
  const inRange = withDistance.filter((r) => {
    if (r.distance_meters == null) return false;
    const bizRadius = r.service_radius_meters ?? 2000;
    return r.distance_meters <= Math.min(bizRadius, MAX_RADIUS_M);
  });

  inRange.sort((a, b) => {
    const da = a.distance_meters ?? Number.POSITIVE_INFINITY;
    const db = b.distance_meters ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  let pool = inRange;

  if (auth.user) {
    const ids = inRange.map((r) => r.id as string);
    const completionByChallenge = new Map<
      string,
      {
        id: string;
        player_status: string;
        completed_at: string | null;
        verification_status: string;
        reward_released: boolean | null;
        expires_at: string | null;
        accepted_at: string | null;
      }
    >();

    if (ids.length > 0) {
      const { data: completions } = await auth.client
        .from("challenge_completions")
        .select(
          "id, challenge_id, player_status, completed_at, verification_status, reward_released, expires_at, accepted_at"
        )
        .eq("user_id", auth.user.id)
        .in("challenge_id", ids)
        .order("accepted_at", { ascending: false });

      for (const row of completions ?? []) {
        const cid = row.challenge_id as string;
        if (!completionByChallenge.has(cid)) {
          completionByChallenge.set(cid, row);
        }
      }
    }

    pool = inRange.filter((r) => {
      const status = derivePlayerStopStatus(
        completionByChallenge.get(r.id as string) ?? null
      );
      return !isChallengeExcludedFromNearbyPool(status);
    });
  }

  return NextResponse.json({
    data: pool.slice(0, limit),
    count: Math.min(pool.length, limit),
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
