/**
 * Stripe integration for merchant plan subscriptions (Free / Growth /
 * Unlimited business limits).
 *
 * IMPORTANT: Stripe cannot onboard businesses registered in the
 * Philippines. Only use this path if the collecting entity is registered in
 * a Stripe-supported country. Otherwise swap this module for a PH gateway
 * (Xendit is already wired in `./xendit`, or PayMongo) -- the rest of the
 * app (plan model, limit trigger, webhook->profiles update) is identical.
 *
 * The module is env-guarded: with no STRIPE_SECRET_KEY it reports
 * `isStripeConfigured() === false` so the build and non-billing flows keep
 * working in dev/CI without keys.
 */

import Stripe from "stripe";
import { PLANS, type PlanCode } from "@/lib/plans";

const SECRET = process.env.STRIPE_SECRET_KEY;

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(SECRET);
}

export function getStripe(): Stripe {
  if (!SECRET) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY (and the price ids) in the environment."
    );
  }
  if (!client) {
    // Pin nothing: use the SDK's bundled API version so type literals stay
    // in sync with whatever `stripe` version is installed.
    client = new Stripe(SECRET);
  }
  return client;
}

/** Resolve the Stripe Price id configured for a paid plan, or null. */
export function priceIdForPlan(plan: PlanCode): string | null {
  const env = PLANS[plan]?.stripePriceEnv;
  if (!env) return null; // free has no price
  return process.env[env] ?? null;
}

/** Reverse lookup: map a Stripe Price id back to our plan code. */
export function planForPriceId(priceId: string | null | undefined): PlanCode | null {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (plan.stripePriceEnv && process.env[plan.stripePriceEnv] === priceId) {
      return plan.code;
    }
  }
  return null;
}

export function verifyWebhook(rawBody: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  return getStripe().webhooks.constructEvent(rawBody, signature, secret);
}
