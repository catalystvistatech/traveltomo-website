-- 045_subscription_expiry_cron.sql
--
-- Merchant promotion subscriptions (merchant_subscriptions) carry a fixed
-- window via starts_at / ends_at. Previously a row kept status='active' even
-- after ends_at passed, so the Promote History badged stale rows as "active"
-- while the live banner (which filters ends_at >= now) showed no promotion.
--
-- This migration:
--   1. expire_merchant_subscriptions(): flips active rows past their ends_at
--      to 'expired' so the stored status matches reality.
--   2. Schedules it hourly via pg_cron.
--
-- The live banner already filters by ends_at, so there is no gap between cron
-- runs. status is a free-text column (the Xendit webhook already writes
-- 'expired'/'failed'), so no constraint change is required. Safe to re-run.

CREATE OR REPLACE FUNCTION public.expire_merchant_subscriptions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.merchant_subscriptions
    SET status = 'expired'
    WHERE status = 'active'
      AND ends_at < now();
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-merchant-subscriptions-hourly');
EXCEPTION WHEN OTHERS THEN
  NULL; -- no existing job
END $$;

SELECT cron.schedule(
  'expire-merchant-subscriptions-hourly',
  '17 * * * *',
  'SELECT public.expire_merchant_subscriptions();'
);

-- Run once now to clean up anything already past.
SELECT public.expire_merchant_subscriptions();
