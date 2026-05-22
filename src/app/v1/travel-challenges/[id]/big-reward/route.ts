import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/travel-challenges/:id/big-reward
 *
 * Returns (or lazily mints) the player's BIG REWARD claim code for a
 * completed travel-challenge set. Called by iOS the moment the player
 * lands on the `BigRewardClaimView`, so the QR they show the merchant
 * resolves to a server-persisted row instead of an ephemeral local
 * string.
 *
 * Requires:
 *   - Authenticated user owns the active `travel_challenge_progress`
 *     row for this travel challenge.
 *   - Progress.status = 'completed'.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { data: progress, error: progressError } = await client
    .from("travel_challenge_progress")
    .select(
      "id, status, completed_at, big_reward_claim_code, big_reward_redeemed_at, travel_challenge_id"
    )
    .eq("user_id", user.id)
    .eq("travel_challenge_id", id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (progressError) {
    return NextResponse.json({ error: progressError.message }, { status: 500 });
  }
  if (!progress) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (progress.status !== "completed") {
    return NextResponse.json(
      { error: "quest_not_completed" },
      { status: 409 }
    );
  }

  if (progress.big_reward_claim_code) {
    return NextResponse.json({
      data: {
        progress_id: progress.id,
        claim_code: progress.big_reward_claim_code,
        redeemed_at: progress.big_reward_redeemed_at,
      },
    });
  }

  const code = generateClaimCode();
  const { error: updateError } = await client
    .from("travel_challenge_progress")
    .update({ big_reward_claim_code: code, updated_at: new Date().toISOString() })
    .eq("id", progress.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      progress_id: progress.id,
      claim_code: code,
      redeemed_at: null,
    },
  });
}

/** Format: TT-BR-XXXX-XXXX (Crockford-style alphabet). */
function generateClaimCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const chunk = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `TT-BR-${chunk()}-${chunk()}`;
}
