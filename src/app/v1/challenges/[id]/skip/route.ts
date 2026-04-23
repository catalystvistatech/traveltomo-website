import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /v1/challenges/:id/skip
 * Consumes a skip token. If tokens are exhausted the caller should play the
 * ad, then call POST /v1/skip-tokens { action: "grant_ad" } to earn one.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id: _challengeId } = await params; // reserved for future audit log
  void _challengeId;
  const { user, client, error } = await requireUser(_request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  await client.rpc("refill_free_skips_if_due", { p_user: user.id });
  const { data, error: rpcError } = await client.rpc("consume_skip_token", {
    p_user: user.id,
  });
  if (rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 });

  // data is expected to be a JSON object like { consumed: true/false, reason? }
  return NextResponse.json({ data });
}
