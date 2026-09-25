import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStripe,
  isStripeConfigured,
  verifyWebhook,
  planForPriceId,
} from "@/lib/payments/stripe";
import type { PlanCode } from "@/lib/plans";

// Stripe webhooks need the raw body and must never be statically cached.
export const dynamic = "force-dynamic";

/** Period end lives on the subscription item in recent API versions; read it
 *  defensively so we don't pin to a single Stripe API shape. */
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const unix = item?.current_period_end;
  return typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = verifyWebhook(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = createAdminClient();

  async function applySubscription(sub: Stripe.Subscription) {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const priceId = sub.items?.data?.[0]?.price?.id;
    const metaPlan = sub.metadata?.plan_code as PlanCode | undefined;
    const plan: PlanCode = planForPriceId(priceId) ?? metaPlan ?? "free";
    const isActive = sub.status === "active" || sub.status === "trialing";

    // Traveler "Unlimited Pass" subscriptions carry metadata.plan =
    // 'traveler_unlimited' (or use the dedicated price). These grant the
    // consumer no-ads entitlement, NOT a merchant business-limit plan.
    const isTraveler =
      sub.metadata?.plan === "traveler_unlimited" ||
      (priceId != null &&
        priceId === process.env.STRIPE_PRICE_TRAVELER_UNLIMITED);

    if (isTraveler) {
      await admin
        .from("profiles")
        .update({
          is_unlimited: isActive,
          unlimited_status: sub.status,
          unlimited_renews_at: periodEndIso(sub),
          stripe_subscription_id: sub.id,
        })
        .eq("stripe_customer_id", customerId);
      return;
    }

    await admin
      .from("profiles")
      .update({
        plan_code: isActive ? plan : "free",
        plan_status: sub.status,
        plan_renews_at: periodEndIso(sub),
        stripe_subscription_id: sub.id,
      })
      .eq("stripe_customer_id", customerId);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subRef = session.subscription;
      if (subRef) {
        const subId = typeof subRef === "string" ? subRef : subRef.id;
        const sub = await getStripe().subscriptions.retrieve(subId);
        await applySubscription(sub);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await admin
        .from("profiles")
        .update({
          plan_code: "free",
          plan_status: "canceled",
          is_unlimited: false,
          unlimited_status: "canceled",
          stripe_subscription_id: null,
        })
        .eq("stripe_customer_id", customerId);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
