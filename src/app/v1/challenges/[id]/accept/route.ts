import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { ensureTravelChallengeProgress } from "@/lib/challenge-progress";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/challenges/:id/accept — user accepts a rolled (or routed)
 * challenge. Reuses an existing in-progress completion if one already
 * exists for this user+challenge so repeated taps don't pile up rows.
 *
 * When the challenge belongs to a travel-challenge set, links the
 * completion to the user's active `travel_challenge_progress` session.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: existing } = await client
    .from("challenge_completions")
    .select("id")
    .eq("user_id", user.id)
    .eq("challenge_id", id)
    .is("completed_at", null)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ data: existing });
  }

  const { data: challengeRow } = await client
    .from("challenges")
    .select("id, travel_challenge_id")
    .eq("id", id)
    .maybeSingle();

  let travelProgressId: string | null = null;
  if (challengeRow?.travel_challenge_id) {
    const progress = await ensureTravelChallengeProgress(
      client,
      user.id,
      challengeRow.travel_challenge_id as string
    );
    travelProgressId = progress.id as string;
  }

  const { data, error: insertError } = await client
    .from("challenge_completions")
    .insert({
      user_id: user.id,
      challenge_id: id,
      verification_status: "pending",
      player_status: "ongoing",
      travel_challenge_progress_id: travelProgressId,
    })
    .select("id")
    .single();

  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 400 });

  return NextResponse.json({ data });
}
