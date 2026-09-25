-- 057_guard_privileged_profile_columns.sql
--
-- CRITICAL: privilege escalation. "Users can update own profile" is
--     FOR UPDATE USING/WITH CHECK (auth.uid() = id)
-- with NO column restriction, and `authenticated` (and `anon`) hold UPDATE
-- on profiles.role / merchant_request_status / plan_code / banned_at.
-- profiles.role is TEXT with a CHECK that allows 'admin' and 'superadmin'.
--
-- So any free signup could
--     PATCH /rest/v1/profiles?id=eq.<own uid>   {"role":"superadmin"}
-- and from that moment current_user_role() returns 'superadmin': every
-- staff RLS policy passes, every `isStaff` bypass in the server actions is
-- taken, and sync_role_to_app_metadata propagates the forged role into the
-- JWT. The same hole lets a rejected merchant set
-- merchant_request_status='approved' and plan_code='unlimited'.
--
-- FIX: a BEFORE UPDATE trigger that rejects changes to the privileged
-- columns unless the write comes from a trusted context:
--   * service_role  - the app's admin client. Every legitimate writer of
--                     role / ban / plan already uses it (updateUserRole,
--                     banUser, unbanUser, the Stripe webhook, entitlement
--                     sync), so nothing legitimate is blocked.
--   * no JWT at all - a direct DB session (migrations, SQL editor).
--                     PostgREST ALWAYS sets a JWT role, so NULL can only
--                     mean a real DB connection, never an API caller.
--
-- The single self-service transition is preserved: a user asking to become
-- a merchant moves merchant_request_status 'none' -> 'pending'
-- (requestMerchantAccess, auth.ts). Every other change to that column is
-- an administrator's decision and is rejected.
--
-- Why a trigger and not a column REVOKE: `authenticated` also holds a
-- TABLE-level UPDATE grant, and a column-level REVOKE is ineffective while
-- that stands. Removing the table grant and re-granting only the allowed
-- columns would have to enumerate every profile field the app edits, and a
-- miss would break ordinary profile saves. The trigger enforces regardless
-- of grants and fails LOUD (an exception), which is the right failure mode
-- for a security guard.
--
-- Named with a `zz_` prefix so it fires last among the BEFORE UPDATE
-- triggers: the superadmin pin triggers (enforce_superadmin_*) run first,
-- and the IS DISTINCT FROM checks only trip on an actual change, so a
-- pinned superadmin editing their own display name still passes.
--
-- Known edge, accepted: if a pinned superadmin's row is somehow wrong and
-- the pin corrects it during a USER-session write, this guard rejects that
-- write. The self-heal still succeeds via the admin client. Loud > silent.
--
-- Safe to re-run.

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
