import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app";

/**
 * POST /v1/billing/checkout
 *
 * Creates a Stripe Checkout session (subscription mode) for the traveler
 * "Unlimited Pass" and returns the hosted checkout URL. The iOS app opens
 * the URL in the browser; entitlement is granted later by the Stripe
 * webhook, not here.
 *
 * Requires the STRIPE_PRICE_TRAVELER_UNLIMITED env var (the recurring
 * Stripe Price id for the Unlimited Pass). When unset we return 503 so the
 * client falls back to the free tier without blocking onboarding.
 */
export async function POST(request: Request) {
  const { user, error } = await requireUser(request);
  if (error || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured yet." },
      { status: 503 }
    );
  }

  const priceId = process.env.STRIPE_PRICE_TRAVELER_UNLIMITED;
  if (!priceId) {
    return NextResponse.json(
      { error: "Unlimited Pass is not available yet." },
      { status: 503 }
    );
  }

  try {
    const stripe = getStripe();
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, display_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: (profile?.display_name as string | null) || undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/?subscription=success`,
      cancel_url: `${SITE_URL}/?subscription=cancelled`,
      metadata: { user_id: user.id, plan: "traveler_unlimited" },
      subscription_data: {
        metadata: { user_id: user.id, plan: "traveler_unlimited" },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "checkout failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
