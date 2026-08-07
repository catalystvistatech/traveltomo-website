-- 035_merchant_business_plans.sql
--
-- Merchant subscription PLANS that gate how many businesses a merchant can
-- create:
--   free      -> 1 business
--   growth    -> 3 businesses
--   unlimited -> no cap
--
-- This is provider-agnostic: Stripe / Xendit / PayMongo just flip
-- `profiles.plan_code` + `plan_status` via their webhook. Enforcement lives
-- in the database (a BEFORE INSERT trigger) so the cap holds for every
-- client -- iOS, web dashboard, and a future Android app -- not just the
-- dashboard UI.
--
-- Safe to re-run.

-- ?? Entitlement + billing identifiers on the profile ??????????????????????
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_code             TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS plan_status           TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_renews_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_code_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_code_check
  CHECK (plan_code IN ('free', 'growth', 'unlimited'));

-- Webhook lookups resolve the merchant by their Stripe customer id.
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ?? Plan -> business allowance (single source of truth) ???????????????????
-- Returns NULL for "unlimited". Keeping the mapping in one function means
-- changing a tier's allowance is a one-line edit.
CREATE OR REPLACE FUNCTION public.plan_business_limit(plan TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE plan
    WHEN 'growth'    THEN 3
    WHEN 'unlimited' THEN NULL
    ELSE 1  -- free / unknown
  END;
$$;

-- ?? Enforcement trigger ???????????????????????????????????????????????????
CREATE OR REPLACE FUNCTION public.enforce_business_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor       UUID;
  v_actor_role  TEXT;
  v_plan        TEXT;
  v_limit       INT;
  v_count       INT;
BEGIN
  v_actor := auth.uid();

  -- Trusted server-side tooling (service role has no JWT uid) bypasses the
  -- cap -- e.g. superadmins managing a merchant's businesses via the admin
  -- client.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Platform staff are uncapped.
  SELECT role INTO v_actor_role FROM public.profiles WHERE id = v_actor;
  IF v_actor_role IN ('admin', 'superadmin') THEN
    RETURN NEW;
  END IF;

  -- Resolve the owning merchant's plan allowance.
  SELECT COALESCE(plan_code, 'free') INTO v_plan
  FROM public.profiles WHERE id = NEW.merchant_id;

  v_limit := public.plan_business_limit(v_plan);
  IF v_limit IS NULL THEN
    RETURN NEW;  -- unlimited
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.businesses
  WHERE merchant_id = NEW.merchant_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION
      'business_limit_reached: your % plan allows % business(es). Upgrade your plan to add more.',
      v_plan, v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_business_limit ON public.businesses;
CREATE TRIGGER trg_enforce_business_limit
  BEFORE INSERT ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_business_limit();
