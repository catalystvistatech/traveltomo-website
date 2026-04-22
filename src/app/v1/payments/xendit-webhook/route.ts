import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Mock Xendit webhook receiver.
 *
 * POST /v1/payments/xendit-webhook
 * Body: { external_id: string, status: "PAID" | "EXPIRED" | "FAILED" }
 *
 * In production we'd verify the `x-callback-token` header, look up the
 * matching subscription, and flip its status accordingly. Here we trust
 * the caller (no token) because mock mode already activates subscriptions
 * synchronously. This endpoint exists so QA can simulate a late webhook
 * and exercise the 'pending' -> 'active' transition.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { external_id?: string; status?: string }
    | null;

  if (!body?.external_id || !body?.status) {
    return NextResponse.json(
      { error: "external_id and status are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: subscription } = await admin
    .from("merchant_subscriptions")
    .select("id, status")
    .eq("external_ref", body.external_id)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json(
      { error: "subscription not found for external_id" },
      { status: 404 }
    );
  }

  const nextStatus = mapStatus(body.status);
  if (!nextStatus) {
    return NextResponse.json({ error: "unknown status" }, { status: 400 });
  }

  const { error } = await admin
    .from("merchant_subscriptions")
    .update({ status: nextStatus })
    .eq("id", subscription.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, subscription_id: subscription.id, status: nextStatus });
}

function mapStatus(raw: string): "active" | "failed" | "expired" | null {
  switch (raw.toUpperCase()) {
    case "PAID":
      return "active";
    case "FAILED":
      return "failed";
    case "EXPIRED":
      return "expired";
    default:
      return null;
  }
}
