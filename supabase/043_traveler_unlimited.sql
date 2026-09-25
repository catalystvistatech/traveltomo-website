-- 043_traveler_unlimited.sql
--
-- Traveler "Unlimited Pass" entitlement. Distinct from the merchant
-- `plan_code` (which gates business limits): this flag controls the
-- consumer-side perks (no ads, unlimited re-rolls, etc.).
--
-- Set by the Stripe webhook when a subscription whose metadata.plan =
-- 'traveler_unlimited' becomes active, and cleared when it ends.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlimited_status TEXT,
  ADD COLUMN IF NOT EXISTS unlimited_renews_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.is_unlimited IS
  'Traveler Unlimited Pass active. Drives no-ads / unlimited perks on the consumer app. Managed by the Stripe webhook.';
