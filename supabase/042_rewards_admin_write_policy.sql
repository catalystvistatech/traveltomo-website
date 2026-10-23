-- 042_rewards_admin_write_policy.sql
--
-- Fix: "new row violates row-level security policy for table rewards"
--
-- The `challenges` table has an "Admins can manage all challenges" policy
-- (001_schema.sql), so an admin/superadmin can insert a challenge with any
-- `merchant_id` -- e.g. the travel-challenge "Add Challenge" flow inserts
-- child challenges with `merchant_id = parent.merchant_id` (the set owner).
--
-- The `rewards` table only had "Merchants can manage own rewards"
-- (WITH CHECK merchant_id = auth.uid()) and SELECT-only admin policies, so
-- the matching reward insert in that same flow was rejected whenever the
-- acting admin/superadmin was not the set owner.
--
-- This adds an admin/superadmin write policy mirroring the challenges one,
-- so rewards can be created on behalf of any merchant by an admin. We check
-- BOTH the JWT app_metadata role and `public.current_user_role()` (which
-- reads `profiles.role`) so a stale JWT can't lock admins out -- matching
-- the robustness pattern used in 016/026.
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Admins can manage all rewards write" ON public.rewards;

CREATE POLICY "Admins can manage all rewards write"
  ON public.rewards FOR ALL
  TO authenticated
  USING (
    (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin')
    OR public.current_user_role() IN ('admin', 'superadmin')
  )
  WITH CHECK (
    (auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin')
    OR public.current_user_role() IN ('admin', 'superadmin')
  );
