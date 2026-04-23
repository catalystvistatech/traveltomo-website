import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

/**
 * POST /v1/verify
 * Body: { code: string, approve: boolean, rejection_reason?: string }
 * Called by a merchant scanning/typing a user's verification code.
 */
export async function POST(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    approve?: boolean;
    rejection_reason?: string;
  };
  if (!body.code)
    return NextResponse.json({ error: "code required" }, { status: 400 });

  const { data: completion, error: findErr } = await client
    .from("challenge_completions")
    .select("id, challenge_id, challenges(merchant_id)")
    .eq("verification_code", body.code)
    .eq("verification_status", "pending")
    .maybeSingle();

  if (findErr)
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!completion)
    return NextResponse.json({ error: "code not found" }, { status: 404 });

  const { error: updateErr } = await client
    .from("challenge_completions")
    .update(
      body.approve
        ? {
            verification_status: "verified",
            verified_at: new Date().toISOString(),
            verified_by: user.id,
            reward_released: true,
          }
        : {
            verification_status: "rejected",
            verified_at: new Date().toISOString(),
            verified_by: user.id,
            rejection_reason: body.rejection_reason ?? "rejected by merchant",
          }
    )
    .eq("id", completion.id);

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
