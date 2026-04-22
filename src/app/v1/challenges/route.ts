import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get("city");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

  const supabase = await createClient();

  let query = supabase
    .from("challenges")
    .select("id, title, description, instructions, type, verification_type, xp_reward, radius_meters, qr_code_value, places(id, name, latitude, longitude, category, image_url, city), rewards(id, title, discount_type, discount_value)")
    .eq("status", "live")
    .limit(limit);

  if (city) {
    query = query.eq("places.city", city);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count: data?.length ?? 0 });
}
