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
 * Turns a thrown Stripe error into something the UI can show. Staff see
 * Stripe's own message (it names the exact problem: a bad price id, a
 * currency clash, a missing customer); merchants get a plain retry hint.
 */
function checkoutError(e: unknown, isStaff: boolean, fallback: string) {
  const err = e as { type?: string; code?: string; message?: string } | null;
  console.error("stripe billing call failed", {
    type: err?.type,
    code: err?.code,
    message: err?.message,
  });
  if (isStaff && err?.message) return `${fallback} Stripe says: ${err.message}`;
  return fallback;
}

/**
 * Starts a plan purchase and returns a Stripe-hosted URL to send the
 * merchant to.
 *
 * - No active subscription yet: a Checkout session (subscription mode).
 * - Already subscribed (e.g. Growth -> Unlimited): a Billing Portal
 *   "confirm plan change" page for the EXISTING subscription. Starting a
 *   second Checkout here would create a duplicate subscription (and Stripe
 *   rejects it outright when the currencies differ).
 *
 * The merchant's Stripe customer is created once and cached on
 * `profiles.stripe_customer_id`. Entitlement is granted later by the
 * webhook, not here.
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
  const isStaff = user.role === "admin" || user.role === "superadmin";
  const priceId = priceIdForPlan(plan);
  if (!priceId) return { error: "That plan is not purchasable." };

  const stripe = getStripe();
  const admin = createAdminClient();
  const fallback = "Couldn't start checkout. Please try again.";

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, stripe_subscription_id, display_name")
      .eq("id", user.id)
      .maybeSingle();

    let customerId = profile?.stripe_customer_id as string | null | undefined;
    const subscriptionId = profile?.stripe_subscription_id as string | null | undefined;

    if (customerId && subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      if (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due") {
        const item = sub.items.data[0];
        if (item?.price?.id === priceId) {
          return { error: "You're already on this plan." };
        }
        const portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${SITE_URL}/admin/billing`,
          flow_data: {
            type: "subscription_update_confirm",
            subscription_update_confirm: {
              subscription: sub.id,
              items: [{ id: item.id, price: priceId, quantity: 1 }],
            },
            after_completion: {
              type: "redirect",
              redirect: { return_url: `${SITE_URL}/admin/billing?status=success` },
            },
          },
        });
        return { url: portal.url };
      }
    }

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
    return { error: checkoutError(e, isStaff, fallback) };
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
    const isStaff = user.role === "admin" || user.role === "superadmin";
    return { error: checkoutError(e, isStaff, "Couldn't open billing. Please try again.") };
  }
}
