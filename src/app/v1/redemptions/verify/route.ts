import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";
import { syncTravelChallengeProgressCompletion } from "@/lib/challenge-progress";

/**
 * POST /v1/redemptions/verify
 * Body: { code: string, reject?: boolean, reason?: string }
 *
 * Merchant verifies a completion via the 6-char code shown in the
 * traveler's reward QR. Marks the completion as verified, releases the
 * reward, and pings the user. Pass reject=true with a reason to decline
 * instead.
 */
export async function POST(request: Request) {
  const { user, error: authError } = await requireUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    reject?: boolean;
    reason?: string;
  };
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code || code.length < 4) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Authorization gate
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "user";
  if (role !== "merchant" && role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Big-reward claim codes start with `TT-BR-`. They live on
  // `travel_challenge_progress`, not on individual completions, so we
  // dispatch to a dedicated handler that flips the redemption flag and
  // notifies the player that the merchant has handed over the prize.
  if (code.startsWith("TT-BR-")) {
    return await handleBigRewardClaim({
      code,
      reject: !!body.reject,
      reason: (body.reason ?? "").trim() || null,
      merchantUserId: user.id,
      role,
      admin,
    });
  }

  const { data: completion, error: fetchError } = await admin
    .from("challenge_completions")
    .select(
      `id, user_id, challenge_id, verification_status, completed_at, travel_challenge_progress_id,
       challenge:challenges!inner ( id, title, merchant_id, travel_challenge_id )`
    )
    .eq("verification_code", code)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!completion) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const challenge = (completion as Record<string, unknown>).challenge as {
    id: string;
    title: string;
    merchant_id: string;
    travel_challenge_id: string | null;
  };
  const isAdmin = role === "admin" || role === "superadmin";
  if (!isAdmin && challenge.merchant_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (completion.verification_status === "verified") {
    return NextResponse.json(
      { error: "already_verified" },
      { status: 409 }
    );
  }
  if (completion.verification_status === "rejected") {
    return NextResponse.json(
      { error: "already_rejected" },
      { status: 409 }
    );
  }

  const isReject = !!body.reject;
  const reason = (body.reason ?? "").trim() || null;

  const updatePayload: Record<string, unknown> = {
    verification_status: isReject ? "rejected" : "verified",
    verified_at: new Date().toISOString(),
    verified_by: user.id,
    reward_released: !isReject,
    rejection_reason: isReject ? reason : null,
    player_status: isReject ? "forfeited" : "claimed",
    // Close out the stop so it's no longer treated as in-flight by the
    // accept route (which keys off completed_at IS NULL). Preserve an
    // existing submission time if the player already submitted proof.
    completed_at:
      (completion as { completed_at?: string | null }).completed_at ??
      new Date().toISOString(),
  };

  const { error: updateError } = await admin
    .from("challenge_completions")
    .update(updatePayload)
    .eq("id", completion.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (
    !isReject &&
    challenge.travel_challenge_id &&
    completion.travel_challenge_progress_id
  ) {
    await syncTravelChallengeProgressCompletion(
      admin,
      completion.user_id,
      challenge.travel_challenge_id,
      completion.travel_challenge_progress_id as string
    );
  }

  await emitNotification({
    userId: completion.user_id,
    kind: "challenge_verified",
    title: isReject ? "Completion rejected" : "Reward unlocked",
    body: isReject
      ? `"${challenge.title}" was not verified${reason ? `: ${reason}` : "."}`
      : `Your completion for "${challenge.title}" has been verified.`,
    icon: isReject ? "xmark.seal.fill" : "checkmark.seal.fill",
    metadata: {
      completion_id: completion.id,
      challenge_id: completion.challenge_id,
      reason,
    },
  });

  return NextResponse.json({
    data: {
      completion_id: completion.id,
      status: isReject ? "rejected" : "verified",
    },
  });
}

type BigRewardArgs = {
  code: string;
  reject: boolean;
  reason: string | null;
  merchantUserId: string;
  role: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
};

async function handleBigRewardClaim(args: BigRewardArgs) {
  const { code, reject, reason, merchantUserId, role, admin } = args;
  const isAdmin = role === "admin" || role === "superadmin";

  const { data: row, error: fetchError } = await admin
    .from("travel_challenge_progress")
    .select(
      `id, user_id, status, completed_at, big_reward_redeemed_at, big_reward_redeemed_by,
       travel_challenge_id,
       travel_challenge:travel_challenges!inner (
         id, merchant_id, title, big_reward_title
       )`
    )
    .eq("big_reward_claim_code", code)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const travelChallenge = (row as Record<string, unknown>).travel_challenge as {
    id: string;
    merchant_id: string;
    title: string;
    big_reward_title: string | null;
  };

  if (!isAdmin && travelChallenge.merchant_id !== merchantUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (row.status !== "completed") {
    return NextResponse.json(
      { error: "quest_not_completed" },
      { status: 409 }
    );
  }
  if (row.big_reward_redeemed_at) {
    return NextResponse.json({ error: "already_redeemed" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("travel_challenge_progress")
    .update({
      big_reward_redeemed_at: reject ? null : now,
      big_reward_redeemed_by: reject ? null : merchantUserId,
      status: reject ? row.status : "completed",
      updated_at: now,
    })
    .eq("id", row.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await emitNotification({
    userId: row.user_id,
    kind: "big_reward_redeemed",
    title: reject ? "Big reward declined" : "Big reward redeemed",
    body: reject
      ? `Your big reward for "${travelChallenge.title}" was declined${reason ? `: ${reason}` : "."}`
      : `${travelChallenge.big_reward_title ?? "Your big reward"} has been redeemed at "${travelChallenge.title}".`,
    icon: reject ? "xmark.seal.fill" : "trophy.fill",
    metadata: {
      progress_id: row.id,
      travel_challenge_id: travelChallenge.id,
      reason,
    },
  });

  return NextResponse.json({
    data: {
      progress_id: row.id,
      travel_challenge_id: travelChallenge.id,
      status: reject ? "rejected" : "redeemed",
      kind: "big_reward",
    },
  });
}
