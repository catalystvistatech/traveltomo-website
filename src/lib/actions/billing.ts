"use server";

import { getCurrentUser } from "@/lib/actions/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStripe,
  isStripeConfigured,
  priceIdForPlan,
} from "@/lib/payments/stripe";
import type { PlanCode } from "@/lib/plans";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.traveltomo.app";

/**
 * Starts a Stripe Checkout (subscription mode) for the chosen plan and
 * returns the hosted checkout URL. The merchant's Stripe customer is created
 * once and cached on `profiles.stripe_customer_id`. Entitlement is granted
 * later by the webhook, not here.
 */
export async function startPlanCheckout(plan: PlanCode) {
  if (!isStripeConfigured()) {
    return { error: "Billing is not configured yet." };
  }
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };
  if (user.role !== "merchant" && user.role !== "admin" && user.role !== "superadmin") {
    return { error: "Merchant access required" };
  }
  const priceId = priceIdForPlan(plan);
  if (!priceId) return { error: "That plan is not purchasable." };

  const stripe = getStripe();
  const admin = createAdminClient();

  try {
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
        metadata: { merchant_id: user.id },
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
      success_url: `${SITE_URL}/admin/billing?status=success`,
      cancel_url: `${SITE_URL}/admin/billing?status=cancelled`,
      metadata: { merchant_id: user.id, plan_code: plan },
      subscription_data: { metadata: { merchant_id: user.id, plan_code: plan } },
    });

    return { url: session.url };
  } catch (e) {
    console.error("startPlanCheckout failed", e);
    return { error: "Couldn't start checkout. Please try again." };
  }
}

/**
 * Opens the Stripe Billing Portal so merchants can upgrade / downgrade /
 * cancel and update payment methods without us building billing UI.
 */
export async function manageBilling() {
  if (!isStripeConfigured()) {
    return { error: "Billing is not configured yet." };
  }
  const user = await getCurrentUser();
  if (!user) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = profile?.stripe_customer_id as string | null | undefined;
  if (!customerId) return { error: "No billing account yet. Choose a plan first." };

  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/admin/billing`,
    });
    return { url: session.url };
  } catch (e) {
    console.error("manageBilling failed", e);
    return { error: "Couldn't open billing. Please try again." };
  }
}
