-- 062_lock_down_entitlements.sql
--
-- Unlimited Pass + billing columns can only be changed by the server.
--
-- 1. New columns:
--      unlimited_source               'storekit' | 'stripe' — which product
--                                     granted is_unlimited, so revoking one
--                                     never clears the other.
--      apple_original_transaction_id  the App Store subscription bound to
--                                     this account; unique, so one Apple
--                                     subscription unlocks one account.
--    /v1/me/entitlement now verifies the StoreKit signed transaction
--    server-side before granting (src/lib/payments/appStore.ts).
--
-- 2. guard_privileged_profile_columns() (057) also protects is_unlimited,
--    unlimited_status, unlimited_renews_at, unlimited_source,
--    apple_original_transaction_id, stripe_customer_id,
--    stripe_subscription_id, plan_status and plan_renews_at. Users could
--    previously PATCH is_unlimited = true straight through the REST API.
--    Every legitimate writer uses the service role (entitlement route,
--    Stripe webhook, billing actions), which the guard lets through.
--    (xp is deliberately NOT guarded: XP is awarded by triggers that can
--    run inside a user's session.)
--
-- 3. expire-storekit-unlimited (hourly): an App Store pass whose renewal
--    date passed more than a day ago is switched off. The app re-syncs with
--    a fresh signed transaction on launch and after every renewal, which
--    moves unlimited_renews_at forward.
--
-- Safe to re-run.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unlimited_source TEXT,
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_unlimited_source_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_unlimited_source_check
  CHECK (unlimited_source IS NULL OR unlimited_source IN ('storekit', 'stripe'));

CREATE UNIQUE INDEX IF NOT EXISTS profiles_apple_original_transaction_id_key
  ON public.profiles (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;

-- Existing Stripe-granted passes (if any) are tagged as such.
UPDATE public.profiles
   SET unlimited_source = 'stripe'
 WHERE is_unlimited AND unlimited_source IS NULL AND stripe_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_role text := auth.role();
BEGIN
  IF caller_role IS NULL OR caller_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'profiles.role can only be changed by an administrator';
  END IF;

  IF NEW.banned_at  IS DISTINCT FROM OLD.banned_at
  OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason THEN
    RAISE EXCEPTION 'ban status can only be changed by an administrator';
  END IF;

  IF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
    RAISE EXCEPTION 'plan_code can only be changed by the billing system';
  END IF;

  IF NEW.plan_status            IS DISTINCT FROM OLD.plan_status
  OR NEW.plan_renews_at         IS DISTINCT FROM OLD.plan_renews_at
  OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'billing fields can only be changed by the billing system';
  END IF;

  IF NEW.is_unlimited                  IS DISTINCT FROM OLD.is_unlimited
  OR NEW.unlimited_status              IS DISTINCT FROM OLD.unlimited_status
  OR NEW.unlimited_renews_at           IS DISTINCT FROM OLD.unlimited_renews_at
  OR NEW.unlimited_source              IS DISTINCT FROM OLD.unlimited_source
  OR NEW.apple_original_transaction_id IS DISTINCT FROM OLD.apple_original_transaction_id THEN
    RAISE EXCEPTION 'the Unlimited Pass can only be changed by the billing system';
  END IF;

  IF NEW.merchant_request_status IS DISTINCT FROM OLD.merchant_request_status THEN
    IF NOT (OLD.merchant_request_status = 'none'
        AND NEW.merchant_request_status = 'pending') THEN
      RAISE EXCEPTION 'merchant_request_status can only be advanced by an administrator';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_privileged_profile_columns() FROM anon, authenticated;

DROP TRIGGER IF EXISTS zz_guard_privileged_profile_columns ON public.profiles;
CREATE TRIGGER zz_guard_privileged_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_profile_columns();

CREATE OR REPLACE FUNCTION public.expire_storekit_unlimited()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.profiles
     SET is_unlimited = false, unlimited_status = 'expired'
   WHERE is_unlimited
     AND unlimited_source = 'storekit'
     AND unlimited_renews_at IS NOT NULL
     AND unlimited_renews_at < now() - interval '1 day';
$$;

REVOKE EXECUTE ON FUNCTION public.expire_storekit_unlimited() FROM anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('expire-storekit-unlimited');
EXCEPTION WHEN OTHERS THEN
  NULL; -- no existing job
END $$;

SELECT cron.schedule('expire-storekit-unlimited', '17 * * * *', 'SELECT public.expire_storekit_unlimited();');
