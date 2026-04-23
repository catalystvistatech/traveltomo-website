import { NextResponse } from "next/server";
import { createApiClient } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `/v1/places/:id` - returns a single place row and any
 * challenges whose business has been linked to this place via its
 * `google_place_id`. If the id cannot be found as a Supabase UUID we
 * fall back to looking it up by `google_place_id` directly.
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

  const { data: place, error: placeErr } = await placeQuery;
  if (placeErr) {
    return NextResponse.json({ error: placeErr.message }, { status: 500 });
  }
  if (!place) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Merchants can optionally pin a business to this Google place. Any
  // published challenges belonging to such a business (or pinned
  // directly to this place via `challenges.place_id`) are returned as
  // the "tagged challenges" for the detail view.
  const [byBusiness, byPlace] = await Promise.all([
    place.google_place_id
      ? supabase
          .from("challenges")
          .select(
            `id, title, description, establishment_type, xp_reward,
             latitude, longitude, status, travel_challenge_id,
             business:businesses!inner (
               id, name, google_place_id
             )`,
          )
          .eq("status", "published")
          .eq("business.google_place_id", place.google_place_id)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("challenges")
      .select(
        `id, title, description, establishment_type, xp_reward,
         latitude, longitude, status, travel_challenge_id,
         business:businesses (id, name, google_place_id)`,
      )
      .eq("status", "published")
      .eq("place_id", place.id),
  ]);

  const errors = [byBusiness.error, byPlace.error].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json(
      { error: errors.map((e) => e?.message).join(", ") },
      { status: 500 },
    );
  }

  const byId = new Map<string, unknown>();
  for (const row of byBusiness.data ?? []) byId.set(row.id as string, row);
  for (const row of byPlace.data ?? []) byId.set(row.id as string, row);
  const challenges = Array.from(byId.values());

  return NextResponse.json({
    data: {
      ...place,
      challenges,
    },
  });
}
