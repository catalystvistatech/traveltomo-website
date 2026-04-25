import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";

/** GET /v1/skip-tokens ? returns { free_skips_remaining, extra_skips, next_refill_at } */
export async function GET(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  await client.rpc("refill_free_skips_if_due", { p_user: user.id });
  const { data, error: rpcError } = await client.rpc("skip_token_status", {
    p_user: user.id,
  });
  if (rpcError)
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * POST /v1/skip-tokens
 * Body: { action: "consume" | "grant_ad" }
 */
export async function POST(request: Request) {
  const { user, client, error } = await requireUser(request);
  if (error || !user)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {}
  const action = body.action ?? "consume";

  if (action === "consume") {
    await client.rpc("refill_free_skips_if_due", { p_user: user.id });
    const { data, error: rpcError } = await client.rpc("consume_skip_token", {
      p_user: user.id,
    });
    if (rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (action === "grant_ad") {
    const { data, error: rpcError } = await client.rpc("grant_skip_from_ad", {
      p_user: user.id,
    });
    if (rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: "invalid action" }, { status: 400 });
}
