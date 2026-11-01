-- 053_promotion_rank.sql
--
-- Promotion persistence already exists: `merchant_subscriptions` carries
-- (merchant_id, tier, status, starts_at, ends_at, amount_cents, provider),
-- and `merchant_has_active_promotion(merchant)` answers "is anything live?".
--
-- What was missing is a TIER-AWARE rank. The existing helper is a boolean, so
-- a ₱99 "basic" merchant outranks nobody and ties with a ₱799 "premium" one —
-- there was no way to order paid placement. Nothing in the product ever sorted
-- on promotion at all (the `is_promoted` column on `recommended_challenges` is
-- computed but never filtered or ordered by), which is why the "Travel Tomo
-- Featured" rail showed Google places instead of promoted merchants.
--
-- `merchant_promotion_rank` returns a sortable integer:
--     3 = premium, 2 = featured, 1 = basic, 0 = no active promotion
-- Only subscriptions that are `active` AND inside their [starts_at, ends_at)
-- window count, so an expired or cancelled tier silently drops to 0 with no
-- extra bookkeeping. Highest active tier wins when a merchant stacks several.
--
-- Ranking is promotion-OPTIONAL by design: with zero active promotions (the
-- state today) every merchant scores 0 and callers fall through to their next
-- sort key (distance), so the Featured rail works before any payment lands.
--
-- Safe to re-run.

CREATE OR REPLACE FUNCTION public.merchant_promotion_rank(p_merchant UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(MAX(
           CASE ms.tier
             WHEN 'premium'  THEN 3
             WHEN 'featured' THEN 2
             WHEN 'basic'    THEN 1
             ELSE 0
           END
         ), 0)
    FROM public.merchant_subscriptions ms
   WHERE ms.merchant_id = p_merchant
     AND ms.status = 'active'
     AND ms.starts_at <= now()
     AND ms.ends_at   > now();
$$;

-- Ranking is read by the server (admin client) on the Featured rail; travelers
-- never call it directly.
REVOKE EXECUTE ON FUNCTION public.merchant_promotion_rank(UUID) FROM anon;

-- Supports both the rank lookup above and the existing active-promotion check.
CREATE INDEX IF NOT EXISTS merchant_subscriptions_active_idx
  ON public.merchant_subscriptions (merchant_id, status, ends_at DESC);
