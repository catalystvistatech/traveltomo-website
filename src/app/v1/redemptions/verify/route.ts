import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitNotification } from "@/lib/notifications/emit";

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

  const { data: completion, error: fetchError } = await admin
    .from("challenge_completions")
    .select(
      `id, user_id, challenge_id, verification_status,
       challenge:challenges!inner ( id, title, merchant_id )`
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
  };

  const { error: updateError } = await admin
    .from("challenge_completions")
    .update(updatePayload)
    .eq("id", completion.id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
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
