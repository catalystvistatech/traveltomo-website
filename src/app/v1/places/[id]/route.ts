import { NextResponse } from "next/server";
import { createApiClient } from "@/lib/supabase/api";
import { hydrateMissingPlacePhotos } from "@/lib/google/placesCache";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `/v1/places/:id` - returns a single place row and any challenges whose
 * business has been linked to this place via its `google_place_id`. If
 * the id cannot be found as a Supabase UUID we fall back to looking it
 * up by `google_place_id` directly.
 *
 * Note: `challenges` does not have a direct FK to `businesses` (its
 * only owner reference is `merchant_id -> profiles.id`), so PostgREST
 * cannot embed `business:businesses(...)` here. We resolve the linked
 * business via `businesses.merchant_id` in a follow-up batched query
 * and stitch the result into the response.
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createApiClient(request);

  const isUuid =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      id,
    );

  const placeQuery = supabase
    .from("places")
    .select(
      "id, name, description, latitude, longitude, category, image_url, city, rating, user_ratings_total, google_place_id",
    )
    .eq(isUuid ? "id" : "google_place_id", id)
    .maybeSingle();

  const { data: rawPlace, error: placeErr } = await placeQuery;
  if (placeErr) {
    return NextResponse.json({ error: placeErr.message }, { status: 500 });
  }
  if (!rawPlace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Business-mirrored rows come in photo-less; pull the hero image from
  // the venue's Google Business listing on first view.
  const [place] = await hydrateMissingPlacePhotos([rawPlace]);

  type ChallengeRow = {
    id: string;
    title: string;
    description: string | null;
    establishment_type: string | null;
    xp_reward: number | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    travel_challenge_id: string | null;
    merchant_id: string;
  };

  // 1. Challenges pinned directly to this place via `challenges.place_id`.
  const byPlacePromise = supabase
    .from("challenges")
    .select(
      `id, title, description, establishment_type, xp_reward,
       latitude, longitude, status, travel_challenge_id, merchant_id`,
    )
    .eq("status", "live")
    .eq("place_id", place.id);

  // 2. Challenges whose merchant pinned a business to this Google place.
  //    Look up the matching businesses first (single column hit, indexed),
  //    then pull challenges for those merchants. Two indexed queries
  //    replace the broken PostgREST embed.
  type BusinessRow = {
    id: string;
    merchant_id: string;
    name: string;
    google_place_id: string | null;
  };

  let matchingBusinesses: BusinessRow[] = [];
  if (place.google_place_id) {
    const { data: bizRows, error: bizErr } = await supabase
      .from("businesses")
      .select("id, merchant_id, name, google_place_id")
      .eq("google_place_id", place.google_place_id);
    if (bizErr) {
      return NextResponse.json({ error: bizErr.message }, { status: 500 });
    }
    matchingBusinesses = (bizRows ?? []) as BusinessRow[];
  }

  const merchantIds = Array.from(
    new Set(matchingBusinesses.map((b) => b.merchant_id))
  );

  const byBusinessPromise = merchantIds.length > 0
    ? supabase
        .from("challenges")
        .select(
          `id, title, description, establishment_type, xp_reward,
           latitude, longitude, status, travel_challenge_id, merchant_id`,
        )
        .eq("status", "live")
        .in("merchant_id", merchantIds)
    : Promise.resolve({ data: [] as ChallengeRow[], error: null });

  const [byPlace, byBusiness] = await Promise.all([
    byPlacePromise,
    byBusinessPromise,
  ]);

  const errors = [byPlace.error, byBusiness.error].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: errors.map((e) => e?.message).join(", ") },
      { status: 500 },
    );
  }

  const businessByMerchant = new Map<string, BusinessRow>(
    matchingBusinesses.map((b) => [b.merchant_id, b])
  );

  function hydrate(row: ChallengeRow) {
    const biz = businessByMerchant.get(row.merchant_id);
    return {
      ...row,
      business: biz
        ? {
            id: biz.id,
            name: biz.name,
            google_place_id: biz.google_place_id,
          }
        : null,
    };
  }

  const byId = new Map<string, ReturnType<typeof hydrate>>();
  for (const row of (byBusiness.data ?? []) as ChallengeRow[]) {
    byId.set(row.id, hydrate(row));
  }
  // Place-linked challenges win over merchant-linked ones if both apply.
  for (const row of (byPlace.data ?? []) as ChallengeRow[]) {
    byId.set(row.id, hydrate(row));
  }
  let challenges = Array.from(byId.values());

  // Drop stops whose parent quest is no longer readable (expired / paused /
  // deleted). Child stops stay 'live' when a quest dies (they revive if the
  // quest is renewed), but tapping one would 404 on the quest-detail route —
  // the RLS policy only exposes live quests, so whatever this (caller-scoped)
  // query returns is exactly the playable set.
  const questIds = Array.from(
    new Set(
      challenges
        .map((c) => c.travel_challenge_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (questIds.length > 0) {
    const { data: liveQuests } = await supabase
      .from("travel_challenges")
      .select("id")
      .in("id", questIds);
    const liveIds = new Set((liveQuests ?? []).map((q) => q.id as string));
    challenges = challenges.filter(
      (c) => !c.travel_challenge_id || liveIds.has(c.travel_challenge_id),
    );
  }

  return NextResponse.json({
    data: {
      ...place,
      challenges,
    },
  });
}
