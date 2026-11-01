import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Xendit invoice webhook.
 *
 * POST /v1/payments/xendit-webhook
 * Header: x-callback-token: <XENDIT_WEBHOOK_TOKEN>
 * Body: { external_id: string, status: "PAID" | "EXPIRED" | "FAILED" }
 *
 * Xendit signs callbacks with the account's verification token in the
 * `x-callback-token` header. It must match XENDIT_WEBHOOK_TOKEN; with no
 * token configured the endpoint refuses everything (fail closed). It used
 * to trust any caller, so anyone who knew an external_ref could mark a
 * promotion paid. QA can still simulate a late webhook by sending the
 * configured token.
 */
function hasValidCallbackToken(request: Request): boolean | null {
  const expected = process.env.XENDIT_WEBHOOK_TOKEN;
  if (!expected) return null;
  const given = request.headers.get("x-callback-token") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const tokenOk = hasValidCallbackToken(request);
  if (tokenOk === null) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  if (!tokenOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
    .select("id, status, merchant_id")
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

  // Once this promotion is active, cancel the merchant's other active
  // promotions so only one runs at a time (tier switch supersedes the old).
  if (nextStatus === "active" && subscription.merchant_id) {
    await admin
      .from("merchant_subscriptions")
      .update({ status: "cancelled" })
      .eq("merchant_id", subscription.merchant_id)
      .eq("status", "active")
      .neq("id", subscription.id);
  }

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
