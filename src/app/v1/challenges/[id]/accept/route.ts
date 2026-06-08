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

  // Resolve the parent travel-challenge so we can wire the new
  // completion to the active progress session in one shot. Cheap single
  // lookup; we always need it anyway for the insert payload.
  const { data: challengeRow } = await client
    .from("challenges")
    .select("id, travel_challenge_id")
    .eq("id", id)
    .maybeSingle();

  let travelProgressId: string | null = null;
  if (challengeRow?.travel_challenge_id) {
    const travelChallengeId = challengeRow.travel_challenge_id as string;

    // Lock-in: a player may only have ONE in-flight stop per quest at a
    // time. The partial unique index only guards one row per
    // (user, challenge), so without this check a player could roll +
    // accept several different stops of the same quest and pile up
    // multiple `ongoing` rows. Reject the accept unless the only
    // in-flight stop is THIS one (idempotent re-tap).
    const { data: siblingInFlight } = await client
      .from("challenge_completions")
      .select("id, challenge_id, challenges!inner(travel_challenge_id)")
      .eq("user_id", user.id)
      .is("completed_at", null)
      // Only a genuinely ongoing stop blocks a new accept. A verified /
      // rejected stop is terminal even if a legacy row left completed_at
      // null, so exclude those defensively (prevents a finished stop from
      // permanently blocking the rest of the quest).
      .eq("player_status", "ongoing")
      .not("verification_status", "in", "(verified,rejected)")
      .eq("challenges.travel_challenge_id", travelChallengeId)
      .neq("challenge_id", id)
      .limit(1)
      .maybeSingle();

    if (siblingInFlight) {
      return NextResponse.json(
        {
          error: "stop_in_progress",
          detail:
            "You already have a stop in progress for this quest. Finish or skip it before starting another.",
        },
        { status: 409 }
      );
    }

    const progress = await ensureTravelChallengeProgress(
      client,
      user.id,
      travelChallengeId
    );
    travelProgressId = progress.id as string;
  }

  // Race-safe accept. The partial unique index
  // `idx_completions_one_active_per_challenge` (migration 025) lets the
  // DB collapse concurrent INSERTs from a flakey-network retry storm
  // into a single row. ON CONFLICT DO NOTHING + a follow-up SELECT
  // covers the case where another in-flight request already created
  // the row (we'd lose the RETURNING value otherwise).
  const { data: inserted, error: insertError } = await client
    .from("challenge_completions")
    .insert({
      user_id: user.id,
      challenge_id: id,
      verification_status: "pending",
      player_status: "ongoing",
      travel_challenge_progress_id: travelProgressId,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    // 23505 = unique_violation. Another request landed first; fall back
    // to reading the existing row so the client gets a consistent
    // completion id either way.
    const isUniqueViolation =
      (insertError as { code?: string }).code === "23505";
    if (!isUniqueViolation) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  if (inserted) {
    return NextResponse.json({ data: inserted });
  }

  const { data: existing, error: existingError } = await client
    .from("challenge_completions")
    .select("id")
    .eq("user_id", user.id)
    .eq("challenge_id", id)
    .is("completed_at", null)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "accept_failed" }, { status: 500 });
  }
  return NextResponse.json({ data: existing });
}
