-- 058_act_as_merchant.sql
--
-- Superadmin "act as merchant": lets an operator edit a named merchant's
-- quest content under THEIR OWN identity, with an audit trail that can
-- always distinguish operator edits from merchant edits.
--
-- Why not real impersonation: minting a session as the merchant would make
-- auth.uid() the merchant, so every row, every verified_by, and every
-- Postgres log line would say the merchant did it. If a merchant later
-- disputed an edit the operator would have no evidence they had not forged
-- it. Under the Data Privacy Act that is strictly worse than holding the
-- merchant's password. Here auth.uid() stays the superadmin: RLS remains a
-- live second boundary, and attribution is preserved.
--
-- The client constraint this satisfies: "di ko naman po pwede kunin logins
-- nya" - no credential ever changes hands.
--
-- Two tables:
--   admin_act_as_sessions  one row per act-as session. The opaque id is what
--                          the cookie carries; the server re-verifies actor,
--                          expiry and role on EVERY request, so a stolen or
--                          forged cookie value grants nothing on its own.
--   admin_act_as_audit     append-only record of what was changed.
--
-- Both are superadmin-readable. Merchants may additionally read the audit
-- rows that concern THEM - the transparency leg of the DPA.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.admin_act_as_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Mandatory. The operator must state why before acting; it is quoted back
  -- to the merchant in the notification.
  reason       TEXT NOT NULL CHECK (length(btrim(reason)) >= 10),
  -- Read-only sessions are for support triage and never notify, since
  -- nothing is processed.
  mode         TEXT NOT NULL DEFAULT 'write' CHECK (mode IN ('read', 'write')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ,
  -- Set once, on the first write, so a 20-stop edit sends one notification
  -- rather than twenty.
  notified_at  TIMESTAMPTZ,
  CONSTRAINT act_as_not_self CHECK (actor_id <> merchant_id)
);

CREATE INDEX IF NOT EXISTS admin_act_as_sessions_actor_live_idx
  ON public.admin_act_as_sessions (actor_id, ended_at, expires_at DESC);
CREATE INDEX IF NOT EXISTS admin_act_as_sessions_merchant_idx
  ON public.admin_act_as_sessions (merchant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_act_as_audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES public.admin_act_as_sessions(id) ON DELETE CASCADE,
  actor_id     UUID NOT NULL,
  -- Denormalized so the trail survives account deletion.
  actor_email  TEXT,
  merchant_id  UUID NOT NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    UUID,
  before       JSONB,
  after        JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_act_as_audit_merchant_idx
  ON public.admin_act_as_audit (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_act_as_audit_session_idx
  ON public.admin_act_as_audit (session_id, created_at DESC);

ALTER TABLE public.admin_act_as_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_act_as_audit    ENABLE ROW LEVEL SECURITY;

-- Sessions: superadmin-only, and only their own. No INSERT/UPDATE policy -
-- sessions are opened and closed through the service role, so a compromised
-- browser session cannot mint one directly against PostgREST.
DROP POLICY IF EXISTS "Superadmins read own act-as sessions" ON public.admin_act_as_sessions;
CREATE POLICY "Superadmins read own act-as sessions"
  ON public.admin_act_as_sessions FOR SELECT TO authenticated
  USING (actor_id = auth.uid() AND public.current_user_role() = 'superadmin');

-- Audit: superadmins see everything; a merchant sees the entries about them.
DROP POLICY IF EXISTS "Superadmins read act-as audit" ON public.admin_act_as_audit;
CREATE POLICY "Superadmins read act-as audit"
  ON public.admin_act_as_audit FOR SELECT TO authenticated
  USING (public.current_user_role() = 'superadmin');

DROP POLICY IF EXISTS "Merchants read own act-as audit" ON public.admin_act_as_audit;
CREATE POLICY "Merchants read own act-as audit"
  ON public.admin_act_as_audit FOR SELECT TO authenticated
  USING (merchant_id = auth.uid());

-- Genuinely append-only. service_role bypasses RLS but NOT triggers, so even
-- an operator with database access cannot quietly rewrite history.
CREATE OR REPLACE FUNCTION public.admin_act_as_audit_is_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_act_as_audit is append-only';
END;
$$;

DROP TRIGGER IF EXISTS admin_act_as_audit_no_rewrite ON public.admin_act_as_audit;
CREATE TRIGGER admin_act_as_audit_no_rewrite
  BEFORE UPDATE OR DELETE ON public.admin_act_as_audit
  FOR EACH ROW EXECUTE FUNCTION public.admin_act_as_audit_is_append_only();
