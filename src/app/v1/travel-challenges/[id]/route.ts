import { NextResponse } from "next/server";
import { createApiClient, requireUser } from "@/lib/supabase/api";
import {
  buildTravelProgressPayload,
  derivePlayerStopStatus,
  globalSkipStatus,
  loadActiveTravelProgress,
  loadStopCompletionsForTravelChallenge,
} from "@/lib/challenge-progress";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /v1/travel-challenges/:id
 *
 * Returns a single live travel challenge with its full list of child
 * challenges so the iOS Challenge Map can render the route as real nodes.
 * When the caller is authenticated, each child includes `player_status`
 * and a `progress` summary for the user's active session on this set.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createApiClient(request);
  const auth = await requireUser(request);

  const { data, error } = await supabase
    .from("travel_challenges")
    .select(
      `id, title, description, cover_url, completion_mode, status,
       big_reward_title, big_reward_description,
       big_reward_discount_type, big_reward_discount_value,
       business:businesses (
         id, name, city, latitude, longitude, establishment_type
       ),
       children:challenges!travel_challenge_id (
         id, title, description, instructions, type, verification_type,
         establishment_type, xp_reward, radius_meters, duration_minutes,
         latitude, longitude, status,
         place:places (id, name, latitude, longitude, category, image_url, city),
         rewards (title, description, discount_type, discount_value, qr_code_value)
       )`
    )
    .eq("id", id)
    .single();

  if (error) {
    // PGRST116 = zero rows from .single(): the quest doesn't exist or is no
    // longer visible under RLS (expired / paused / deleted). Surface a human
    // message — the raw "Cannot coerce the result to a single JSON object"
    // leaked straight into the iOS error alert.
    if (error.code === "PGRST116") {
      return NextResponse.json(
        { error: "This quest is no longer available." },
        { status: 404 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "This quest is no longer available." },
      { status: 404 }
    );
  }

  type ChildRow = {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    type: string;
    verification_type: string | null;
    establishment_type: string | null;
    xp_reward: number | null;
    radius_meters: number | null;
    duration_minutes: number | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    place: {
      id: string;
      name: string;
      latitude: number | null;
      longitude: number | null;
      category: string | null;
      image_url: string | null;
      city: string | null;
    } | null;
    rewards: {
      title: string;
      description: string | null;
      discount_type: string;
      discount_value: number | null;
      qr_code_value: string | null;
    }[] | null;
  };

  type TravelRow = {
    id: string;
    title: string;
    description: string | null;
    cover_url: string | null;
    completion_mode: string;
    status: string;
    big_reward_title: string | null;
    big_reward_description: string | null;
    big_reward_discount_type: string | null;
    big_reward_discount_value: number | null;
    business: {
      id: string;
      name: string;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
      establishment_type: string | null;
    } | null;
    children: ChildRow[] | null;
  };

  const row = data as unknown as TravelRow;
  const businessLat = row.business?.latitude ?? null;
  const businessLng = row.business?.longitude ?? null;

  const liveChildren = (row.children ?? []).filter(
    (c) => c.status === "live" || c.status === "approved"
  );

  let completionsByChallenge = new Map<
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
  let progress = null;

  if (auth.user) {
    completionsByChallenge = await loadStopCompletionsForTravelChallenge(
      auth.client,
      auth.user.id,
      id
    );
    progress = await loadActiveTravelProgress(auth.client, auth.user.id, id);
  }

  const childIds = liveChildren.map((c) => c.id);

  const children = liveChildren
    .map((c) => {
      const lat = c.latitude ?? c.place?.latitude ?? businessLat;
      const lng = c.longitude ?? c.place?.longitude ?? businessLng;
      const reward = c.rewards?.[0] ?? null;
      const completion = completionsByChallenge.get(c.id) ?? null;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        instructions: c.instructions,
        type: c.type,
        verification_type: c.verification_type,
        establishment_type:
          c.establishment_type ?? row.business?.establishment_type ?? null,
        xp_reward: c.xp_reward,
        radius_meters: c.radius_meters,
        duration_minutes: c.duration_minutes,
        latitude: lat,
        longitude: lng,
        place_id: c.place?.id ?? null,
        place_name: c.place?.name ?? row.business?.name ?? c.title,
        place_image_url: c.place?.image_url ?? null,
        reward_title: reward?.title ?? null,
        reward_description: reward?.description ?? null,
        reward_qr_code: reward?.qr_code_value ?? null,
        player_status: auth.user
          ? derivePlayerStopStatus(completion)
          : "available",
      };
    })
    .filter((c) => c.latitude != null && c.longitude != null);

  // Skips are one GLOBAL 3h-recharging pool (not per-quest), so the
  // progress payload reports the pool state — this is what seeds the
  // map's "skips left" pill.
  let progressPayload = auth.user
    ? buildTravelProgressPayload(progress, childIds, completionsByChallenge)
    : null;
  if (auth.user && progressPayload) {
    try {
      const pool = await globalSkipStatus(auth.client, auth.user.id);
      progressPayload = {
        ...progressPayload,
        skips_used: pool.skips_used,
        skips_limit: pool.skips_limit,
      };
    } catch {
      // Pool lookup is display-only; keep the payload on failure.
    }
  }

  return NextResponse.json({
    data: {
      id: row.id,
      title: row.title,
      description: row.description,
      cover_url: row.cover_url,
      completion_mode: row.completion_mode,
      status: row.status,
      reward_title: row.big_reward_title,
      reward_description: row.big_reward_description,
      reward_discount_type: row.big_reward_discount_type,
      reward_discount_value: row.big_reward_discount_value,
      business_id: row.business?.id ?? null,
      business_name: row.business?.name ?? null,
      business_city: row.business?.city ?? null,
      business_latitude: businessLat,
      business_longitude: businessLng,
      establishment_type: row.business?.establishment_type ?? null,
      progress: progressPayload,
      children,
    },
  }, {
    // The body carries per-user `progress` + per-stop `player_status`,
    // so we can't share it across users. Private cache lets the iOS
    // URLCache absorb the quest-preview re-opens that fire during
    // navigation between Home and the map.
    headers: { "Cache-Control": "private, max-age=20" },
  });
}
