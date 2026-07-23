import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

/**
 * GET /v1/favorites
 * Returns the caller's saved places, newest first:
 *   { data: [{ place_id, created_at, name, description, category, city,
 *              image_url, latitude, longitude, rating }] }
 * RLS restricts rows to the caller.
 */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data, error: qErr } = await client
    .from("favorites")
    .select(
      "place_id, created_at, places!inner(id, name, description, category, city, image_url, latitude, longitude, rating)"
    )
    .order("created_at", { ascending: false });

  if (qErr)
    return NextResponse.json({ error: qErr.message }, { status: 500 });

  type Row = {
    place_id: string;
    created_at: string;
    places: {
      id: string;
      name: string | null;
      description: string | null;
      category: string | null;
      city: string | null;
      image_url: string | null;
      latitude: number | null;
      longitude: number | null;
      rating: number | null;
    } | null;
  };

  const favorites = ((data ?? []) as unknown as Row[]).map((r) => ({
    place_id: r.place_id,
    created_at: r.created_at,
    name: r.places?.name ?? "Place",
    description: r.places?.description ?? null,
    category: r.places?.category ?? null,
    city: r.places?.city ?? null,
    image_url: r.places?.image_url ?? null,
    latitude: r.places?.latitude ?? null,
    longitude: r.places?.longitude ?? null,
    rating: r.places?.rating ?? null,
  }));

  return NextResponse.json({ data: favorites });
}

/**
 * POST /v1/favorites  { place_id }
 * Idempotent add (upsert on the (user, place) PK).
 */
export async function POST(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { place_id?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const placeId = body.place_id;
  if (!placeId)
    return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const { error: insErr } = await client
    .from("favorites")
    .upsert(
      { user_id: user.id, place_id: placeId },
      { onConflict: "user_id,place_id", ignoreDuplicates: true }
    );

  if (insErr)
    return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ data: { place_id: placeId, favorited: true } });
}

/**
 * DELETE /v1/favorites?place_id=...
 * Idempotent remove.
 */
export async function DELETE(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(request.url);
  const placeId = url.searchParams.get("place_id");
  if (!placeId)
    return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const { error: delErr } = await client
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("place_id", placeId);

  if (delErr)
    return NextResponse.json({ error: delErr.message }, { status: 400 });

  return NextResponse.json({ data: { place_id: placeId, favorited: false } });
}
