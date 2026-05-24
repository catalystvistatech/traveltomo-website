import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

export const dynamic = "force-dynamic";

/**
 * GET /v1/me/active-challenge
 *
 * Returns the caller's most recent in-progress challenge � a
 * `challenge_completions` row that has been accepted (status `pending`)
 * but not yet verified (`completed_at IS NULL`). The response includes
 * enough info for the iOS app to render a "Continue Challenge" banner
 * and reopen the Challenge Map in the right shape:
 *
 *   - `travel_challenge_id` set ? launch via `.travelChallenge`
 *   - `travel_challenge_id` null ? launch via `.singleChallenge` using
 *     the included challenge coords + establishment type.
 *
 * RLS already restricts `challenge_completions` to the calling user, so
 * we never trust client-provided ids.
 */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // `challenges` has no direct FK to `businesses` � only `merchant_id ->
  // profiles.id`. We embed every relation PostgREST CAN discover, then
  // resolve the merchant's business in a second query below.
  const { data, error: queryError } = await client
    .from("challenge_completions")
    .select(
      `id, accepted_at, completed_at, verification_status,
       challenge:challenges!inner (
         id, title, description, latitude, longitude,
         establishment_type, verification_type, merchant_id,
         travel_challenge_id,
         travel_challenge:travel_challenges (
           id, title, cover_url
         ),
         place:places ( id, name, latitude, longitude )
       )`
    )
    .eq("user_id", user.id)
    .eq("verification_status", "pending")
    .is("completed_at", null)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  // Private cache for both the empty and populated responses so the
  // iOS URLCache short-circuits Home's per-appear refresh storms.
  const cacheHeaders = { "Cache-Control": "private, max-age=15" };

  if (queryError) {
    if (queryError.code === "PGRST116") {
      return NextResponse.json({ data: null }, { headers: cacheHeaders });
    }
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ data: null }, { headers: cacheHeaders });
  }

  type Row = {
    id: string;
    accepted_at: string | null;
    completed_at: string | null;
    verification_status: string;
    challenge: {
      id: string;
      title: string;
      description: string | null;
      latitude: number | null;
      longitude: number | null;
      establishment_type: string | null;
      verification_type: string | null;
      merchant_id: string | null;
      travel_challenge_id: string | null;
      travel_challenge: {
        id: string;
        title: string;
        cover_url: string | null;
      } | null;
      place: {
        id: string;
        name: string;
        latitude: number | null;
        longitude: number | null;
      } | null;
    } | null;
  };

  const row = data as unknown as Row;
  const challenge = row.challenge;

  if (!challenge) {
    return NextResponse.json({ data: null });
  }

  // Resolve the merchant's business � used as the final coordinate
  // fallback when the challenge doesn't carry its own pin and the
  // linked place is null. Public read on `businesses` is allowed by
  // migration 014 (traveler_read_businesses).
  type BusinessRow = {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    establishment_type: string | null;
  };
  let business: BusinessRow | null = null;
  if (challenge.merchant_id) {
    const { data: businessRow } = await client
      .from("businesses")
      .select("id, name, latitude, longitude, establishment_type")
      .eq("merchant_id", challenge.merchant_id)
      .maybeSingle();
    business = (businessRow as BusinessRow | null) ?? null;
  }

  const latitude =
    challenge.latitude ?? challenge.place?.latitude ?? business?.latitude ?? null;
  const longitude =
    challenge.longitude ?? challenge.place?.longitude ?? business?.longitude ?? null;
  const establishmentType =
    challenge.establishment_type ?? business?.establishment_type ?? null;

  return NextResponse.json({
    data: {
      completion_id: row.id,
      accepted_at: row.accepted_at,
      verification_status: row.verification_status,
      challenge: {
        id: challenge.id,
        title: challenge.title,
        description: challenge.description,
        latitude,
        longitude,
        establishment_type: establishmentType,
        verification_type: challenge.verification_type,
        place_name: challenge.place?.name ?? business?.name ?? challenge.title,
      },
      travel_challenge: challenge.travel_challenge
        ? {
            id: challenge.travel_challenge.id,
            title: challenge.travel_challenge.title,
            cover_url: challenge.travel_challenge.cover_url,
          }
        : null,
    },
  }, { headers: cacheHeaders });
}
