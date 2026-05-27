import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
// syncTravelChallengeProgressCompletion is invoked by /v1/redemptions/verify
// when the merchant approves the code, not at this stage.

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/challenges/:id/complete
 * Body: { completion_id?, gps_latitude?, gps_longitude?, proof_url? }
 *
 * Marks the user's active (in-flight) completion as `submitted`,
 * stamps `completed_at`, attaches the proof, and generates the 6-char
 * verification code the user shows the merchant.
 *
 * Two invariants this route must guarantee:
 *   1. The UPDATE must target ONLY the active row (completed_at IS NULL)
 *      so a re-roll onto a previously-skipped challenge doesn't
 *      overwrite the skipped row's already-set completed_at.
 *   2. The route must surface an error if zero rows were updated. Prior
 *      to migration 027 the user-side UPDATE was silently rejected by
 *      RLS and this endpoint happily returned a verification code with
 *      nothing written to the DB - "Nothing pending" forever.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    completion_id?: string;
    gps_latitude?: number;
    gps_longitude?: number;
    proof_url?: string;
  };

  const code = generateCode();

  let q = client
    .from("challenge_completions")
    .update({
      verification_status: "pending",
      verification_code: code,
      completed_at: new Date().toISOString(),
      player_status: "submitted",
      gps_latitude: body.gps_latitude ?? null,
      gps_longitude: body.gps_longitude ?? null,
      proof_url: body.proof_url ?? null,
    })
    .eq("user_id", user.id)
    .eq("challenge_id", id)
    // Lock to the active row so abandoned (`skipped` + completed_at set)
    // rows can't be silently revived as if the user had just submitted.
    .is("completed_at", null);

  if (body.completion_id) {
    q = q.eq("id", body.completion_id);
  }

  const { data, error: updateError } = await q.select("id");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (!data || data.length === 0) {
    // RLS rejection, missing accept row, or the user re-rolled onto a
    // different challenge before submitting. Either way the client
    // can't be told "success" - they wouldn't see the reward in
    // My Rewards and would assume the submission was lost.
    return NextResponse.json(
      {
        error: "no_active_completion",
        detail:
          "No active completion found for this challenge. Tap Start Challenge to roll again.",
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    data: { id: data[0].id, verification_code: code },
  });
}

function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
