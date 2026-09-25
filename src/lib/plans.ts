/**
 * Merchant subscription plans that gate how many businesses a merchant can
 * create. This is the single client-side source of truth for plan metadata;
 * the database mirrors the allowance in `public.plan_business_limit()` and
 * enforces it with a trigger (migration 035). Keep the two in sync.
 *
 * Plain module (no "use server") so both client components and server
 * actions can import the config and types.
 */

export type PlanCode = "free" | "growth" | "unlimited";

export interface PlanDef {
  code: PlanCode;
  label: string;
  /** Max businesses; `null` means unlimited. */
  businessLimit: number | null;
  /** Display price in PHP per month (0 for free). UI/marketing only. */
  pricePhpMonthly: number;
  blurb: string;
  /** Env var holding the gateway Price/Plan id for this tier (set in prod). */
  stripePriceEnv?: string;
}

export const PLANS: Record<PlanCode, PlanDef> = {
  free: {
    code: "free",
    label: "Free",
    businessLimit: 1,
    pricePhpMonthly: 0,
    blurb: "1 business",
  },
  growth: {
    code: "growth",
    label: "Growth",
    businessLimit: 3,
    pricePhpMonthly: 499,
    blurb: "Up to 3 businesses",
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
  },
  unlimited: {
    code: "unlimited",
    label: "Unlimited",
    businessLimit: null,
    pricePhpMonthly: 1499,
    blurb: "Unlimited businesses",
    stripePriceEnv: "STRIPE_PRICE_UNLIMITED",
  },
};

export const PLAN_ORDER: PlanCode[] = ["free", "growth", "unlimited"];

/** Mirror of the DB function. `null` = unlimited. */
export function planBusinessLimit(code: PlanCode | string | null | undefined): number | null {
  switch (code) {
    case "growth":
      return 3;
    case "unlimited":
      return null;
    default:
      return 1; // free / unknown
  }
}
