import { NextResponse } from "next/server";
import { createApiClient } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /v1/travel-challenges/:id
 *
 * Returns a single live travel challenge with its full list of child
 * challenges so the iOS Challenge Map can render the route as real nodes.
 * Each child ships with coordinates (falling back to the business location
 * when the challenge itself doesn't carry a pin).
 */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = createApiClient(request);

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
         establishment_type, xp_reward, radius_meters,
         latitude, longitude, status,
         place:places (id, name, latitude, longitude, category, image_url, city)
       )`
    )
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "PGRST116" ? 404 : 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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

  const children = (row.children ?? [])
    .filter((c) => c.status === "live" || c.status === "approved")
    .map((c) => {
      const lat = c.latitude ?? c.place?.latitude ?? businessLat;
      const lng = c.longitude ?? c.place?.longitude ?? businessLng;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        instructions: c.instructions,
        type: c.type,
        verification_type: c.verification_type,
        establishment_type: c.establishment_type ?? row.business?.establishment_type ?? null,
        xp_reward: c.xp_reward,
        radius_meters: c.radius_meters,
        latitude: lat,
        longitude: lng,
        place_name: c.place?.name ?? row.business?.name ?? c.title,
        place_image_url: c.place?.image_url ?? null,
      };
    })
    .filter((c) => c.latitude != null && c.longitude != null);

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
      children,
    },
  });
}
