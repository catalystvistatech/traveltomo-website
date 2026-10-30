// Single source of truth for merchant promotion tier pricing.
//
// These tiers are billed through Xendit in PHP (not Stripe -- Stripe is only
// used for merchant business-count plans and the traveler Unlimited Pass), so
// there is no Stripe Price to read. Keeping the amounts here means the price
// shown on the Promote cards always matches what `startSubscription` actually
// charges, and currency formatting comes from `Intl` so the peso sign renders
// correctly everywhere (no hardcoded glyphs that can mojibake).

export type PromotionTier = "basic" | "featured" | "premium";

export const PROMOTION_CURRENCY = "PHP";

// Monthly price per tier, in centavos. Amount charged = cents * months.
export const PROMOTION_TIER_PRICES_CENTS: Record<PromotionTier, number> = {
  basic: 9900,
  featured: 29900,
  premium: 79900,
};

// Formats centavos as proper PHP currency (peso sign, no trailing decimals).
export function formatPHP(cents: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: PROMOTION_CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// Monthly price label for a tier card, e.g. "P99 / mo" rendered with the peso sign.
export function formatTierPriceMonthly(tier: PromotionTier): string {
  return `${formatPHP(PROMOTION_TIER_PRICES_CENTS[tier])} / mo`;
}
