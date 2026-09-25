-- 059_audit_allow_erasure.sql
--
-- REGRESSION from 058. The append-only guard on admin_act_as_audit fired on
-- BEFORE UPDATE **OR DELETE** and raised unconditionally. Cascaded deletes
-- fire row-level triggers, and the chain is:
--
--   auth.users -> profiles -> admin_act_as_sessions -> admin_act_as_audit
--                (ON DELETE CASCADE at every hop)
--
-- so deleting a merchant account raised inside the cascade and rolled the
-- whole delete back. Any merchant who had ever been acted upon became
-- undeletable — which breaks the DPA right to erasure that this very feature
-- exists to respect. A privacy feature must not make erasure impossible.
--
-- FIX: guard UPDATE only. Deletion protection does not need a trigger:
-- admin_act_as_audit has no DELETE policy for any API role, so no traveler,
-- merchant or admin can delete a row through PostgREST. Only the service
-- role — the account-deletion path itself — and a cascade can remove rows.
--
-- The important property is preserved: a recorded entry can never be
-- silently REWRITTEN to say something different. Erasing an account removes
-- that person's history wholesale, which is the intended outcome of erasure,
-- not a way to doctor it.
--
-- Safe to re-run.

DROP TRIGGER IF EXISTS admin_act_as_audit_no_rewrite ON public.admin_act_as_audit;
CREATE TRIGGER admin_act_as_audit_no_rewrite
  BEFORE UPDATE ON public.admin_act_as_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_act_as_audit_is_append_only();
