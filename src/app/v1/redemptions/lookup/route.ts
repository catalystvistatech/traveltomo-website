import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /v1/redemptions/lookup?code=XXXXXX
 *
 * Merchant looks up a completion by its 6-char verification code so they
 * can preview the challenge + reward before approving the redemption.
 * Only the owning merchant (or an admin) can resolve a code.
 */
export async function GET(request: Request) {
  const { user, error: authError } = await requireUser(request);
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = (searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code || code.length < 4) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the calling user's role
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = profile?.role ?? "user";
  if (role !== "merchant" && role !== "admin" && role !== "superadmin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Big-reward claim codes (`TT-BR-*`) live on travel_challenge_progress,
  // not challenge_completions. Surface enough fields for the merchant
  // scanner to display the BIG REWARD title before approving.
  if (code.startsWith("TT-BR-")) {
    return await lookupBigRewardClaim({
      code,
      merchantUserId: user.id,
      role,
      admin,
    });
  }

  const { data, error } = await admin
    .from("challenge_completions")
    .select(
      `id, verification_code, verification_status, completed_at, proof_url, gps_latitude, gps_longitude,
       user:profiles!challenge_completions_user_id_fkey ( id, display_name ),
       challenge:challenges!inner (
         id, title, merchant_id, xp_reward,
         rewards ( title, description, discount_type, discount_value )
       )`
    )
    .eq("verification_code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Authorization: merchant can only look up codes for their own challenges
  const challenge = (data as Record<string, unknown>).challenge as {
    merchant_id?: string;
  } | null;
  const isAdmin = role === "admin" || role === "superadmin";
  if (!isAdmin && challenge?.merchant_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data });
}

type BigRewardLookupArgs = {
  code: string;
  merchantUserId: string;
  role: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
};

async function lookupBigRewardClaim(args: BigRewardLookupArgs) {
  const { code, merchantUserId, role, admin } = args;
  const { data, error } = await admin
    .from("travel_challenge_progress")
    .select(
      `id, user_id, status, completed_at, big_reward_claim_code, big_reward_redeemed_at,
       user:profiles!travel_challenge_progress_user_id_fkey ( id, display_name ),
       travel_challenge:travel_challenges!inner (
         id, merchant_id, title, big_reward_title, big_reward_description,
         big_reward_discount_type, big_reward_discount_value
       )`
    )
    .eq("big_reward_claim_code", code)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const travelChallenge = (data as Record<string, unknown>).travel_challenge as {
    merchant_id?: string;
  } | null;
  const isAdmin = role === "admin" || role === "superadmin";
  if (!isAdmin && travelChallenge?.merchant_id !== merchantUserId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    data: { ...data, kind: "big_reward" },
  });
}
