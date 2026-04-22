import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const category = searchParams.get("category");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const supabase = await createClient();

  let query = supabase
    .from("places")
    .select("id, name, description, latitude, longitude, category, image_url, city, rating, user_ratings_total, google_place_id")
    .eq("is_active", true)
    .limit(limit);

  if (city) query = query.eq("city", city);
  if (category) query = query.eq("category", category);
  if (lat && lng) {
    query = query.order("name");
  } else {
    query = query.order("rating", { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length ?? 0 });
}
