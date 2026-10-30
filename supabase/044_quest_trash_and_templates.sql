-- 044_quest_trash_and_templates.sql
--
-- Two related features for quests (travel_challenges):
--
-- 1) 30-day Trash: deleting a quest soft-deletes it (status = 'deleted',
--    deleted_at = now()) so it can be restored within 30 days. A cron job
--    hard-deletes anything older than that. Traveler-facing queries filter
--    `status = 'live'`, so a trashed quest disappears for travelers with no
--    extra filters needed.
--
-- 2) Quest Templates: a merchant-owned library of whole-quest snapshots
--    (parent + stops as JSONB) so a quest can be re-created later. Deleting
--    a quest also auto-saves a template copy.
--
-- Idempotent: safe to re-run.

-- 1) Soft-delete support -------------------------------------------------

ALTER TABLE public.travel_challenges
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.travel_challenges
  DROP CONSTRAINT IF EXISTS travel_challenges_status_check;
ALTER TABLE public.travel_challenges
  ADD CONSTRAINT travel_challenges_status_check
  CHECK (status IN ('draft','pending_review','approved','live','paused','archived','rejected','expired','deleted'));

CREATE INDEX IF NOT EXISTS idx_travel_challenges_deleted_at
  ON public.travel_challenges (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 2) Quest templates -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.quest_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  stop_count  INTEGER NOT NULL DEFAULT 0,
  snapshot    JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quest_templates_merchant
  ON public.quest_templates (merchant_id, created_at DESC);

ALTER TABLE public.quest_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Merchants manage own quest templates" ON public.quest_templates;
CREATE POLICY "Merchants manage own quest templates"
  ON public.quest_templates FOR ALL
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all quest templates" ON public.quest_templates;
CREATE POLICY "Admins read all quest templates"
  ON public.quest_templates FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','superadmin'));

-- 3) Purge cron ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_deleted_quests()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.travel_challenges
  WHERE status = 'deleted'
    AND deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
$$;

-- pg_cron was enabled in 038. schedule() upserts by job name.
SELECT cron.schedule(
  'purge-deleted-quests',
  '30 3 * * *',
  $$ SELECT public.purge_deleted_quests(); $$
);
