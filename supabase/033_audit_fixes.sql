-- 033_audit_fixes.sql
--
-- Forward-only corrections from the migration audit of supabase/001-032
-- (see docs/MIGRATION_AUDIT.md). Every statement here is additive and
-- idempotent: it is safe to run on a live database that already has
-- 001-032 applied, and safe to re-run. It does NOT rewrite any
-- historical migration.
--
-- Two classes of fix:
--   1. Missing indexes on columns used in RLS USING/WITH CHECK clauses
--      and hot lookups (so policy checks do not seq-scan).
--   2. Pinning search_path on the handful of helper functions that were
--      created without it (closes the Supabase "function_search_path_
--      mutable" advisor warning). All of these functions schema-qualify
--      their object references, so SET search_path = '' is behaviour-
--      preserving; pg_catalog remains implicitly resolvable for builtins.

-- ------------------------------------------------------------------
-- 1. RLS / hot-path indexes
-- ------------------------------------------------------------------

-- Migration 020 added merchant SELECT/UPDATE policies on
-- travel_challenge_progress keyed on travel_challenge_id
-- ("travel_challenge_id IN (SELECT id FROM travel_challenges WHERE
-- merchant_id = auth.uid())"). The only indexes on this table
-- (idx_travel_progress_one_active, idx_travel_progress_user) lead with
-- user_id, so a merchant scanning by quest had no usable index.
CREATE INDEX IF NOT EXISTS idx_travel_progress_travel_challenge
  ON public.travel_challenge_progress (travel_challenge_id);

-- Migration 005 created xendit_invoices with an RLS policy filtering on
-- merchant_id ("merchant_id = auth.uid() OR ..."), but only indexed
-- xendit_id. Add the merchant_id index that backs the policy.
CREATE INDEX IF NOT EXISTS idx_xendit_invoices_merchant
  ON public.xendit_invoices (merchant_id);

-- ------------------------------------------------------------------
-- 2. Pin search_path on helper functions missing it
-- ------------------------------------------------------------------
-- These are not SECURITY DEFINER, so the risk is lower than a definer
-- function, but a mutable search_path is still flagged by the Supabase
-- linter and is a hardening best practice. Guarded with to_regprocedure
-- so the migration never errors if a signature is absent.

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_updated_at() SET search_path = '';
  END IF;

  IF to_regprocedure('public.skip_token_status(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.skip_token_status(uuid) SET search_path = '';
  END IF;

  IF to_regprocedure('public.merchant_is_open_now(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.merchant_is_open_now(uuid) SET search_path = '';
  END IF;

  IF to_regprocedure('public.merchant_has_active_promotion(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.merchant_has_active_promotion(uuid) SET search_path = '';
  END IF;
END $$;
