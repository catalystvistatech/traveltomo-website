import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/challenges/:id/abandon
 *
 * Marks the caller's active completion for this challenge as
 * `player_status = 'skipped'` and (for travel-challenge stops) consumes
 * one of the per-quest free skip tokens. Used by the iOS app when the
 * traveler explicitly opts out of a committed challenge from the
 * navigation / arrival overlays.
 *
 * Returns:
 *   {
 *     consumed: bool,      // true when a quest skip was charged
 *     requires_ad: bool,   // true when the budget is exhausted
 *     skips_used: number,
 *     skips_limit: number,
 *     completion_id: string | null
 *   }
 */
export async function POST(request: Request, { params }: Params) {
  const { id: challengeId } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Find the active (not-yet-completed) completion row so we can mark
  // it skipped and free the user up to roll again.
  const { data: completion, error: completionError } = await client
    .from("challenge_completions")
    .select("id, travel_challenge_progress_id, challenge:challenges!inner(travel_challenge_id)")
    .eq("user_id", user.id)
    .eq("challenge_id", challengeId)
    .is("completed_at", null)
    .order("accepted_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (completionError) {
    return NextResponse.json({ error: completionError.message }, { status: 500 });
  }
  if (!completion) {
    return NextResponse.json(
      { error: "no_active_completion" },
      { status: 404 }
    );
  }

  const challenge = (completion as Record<string, unknown>).challenge as {
    travel_challenge_id: string | null;
  } | null;

  // Move the completion to skipped first so the partial unique index on
  // (user_id, challenge_id) WHERE completed_at IS NULL frees up; without
  // this the next /accept call would refuse to start the same challenge
  // again later (rare but possible if the user re-rolls onto the same
  // pin after several other stops).
  const { error: updateError } = await client
    .from("challenge_completions")
    .update({
      player_status: "skipped",
      completed_at: new Date().toISOString(),
    })
    .eq("id", completion.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let skipResult = {
    consumed: false,
    requires_ad: false,
    skips_used: 0,
    skips_limit: 3,
  };

  // Consume a quest skip token when this challenge belongs to a travel
  // challenge set so the budget tracks abandonments alongside re-rolls.
  if (challenge?.travel_challenge_id && completion.travel_challenge_progress_id) {
    const { data: rpcResult, error: rpcError } = await client.rpc(
      "consume_quest_skip",
      {
        p_user: user.id,
        p_progress_id: completion.travel_challenge_progress_id,
      }
    );
    if (rpcError) {
      // The completion is already skipped; surface the token error
      // without rolling back so the user still gets unstuck.
      return NextResponse.json(
        {
          error: rpcError.message,
          partial_success: true,
          completion_id: completion.id,
        },
        { status: 500 }
      );
    }
    if (rpcResult && typeof rpcResult === "object") {
      const r = rpcResult as Record<string, unknown>;
      skipResult = {
        consumed: r.consumed === true,
        requires_ad: r.requires_ad === true,
        skips_used: typeof r.skips_used === "number" ? r.skips_used : 0,
        skips_limit: typeof r.skips_limit === "number" ? r.skips_limit : 3,
      };
    }
  }

  return NextResponse.json({
    data: {
      ...skipResult,
      completion_id: completion.id,
    },
  });
}
