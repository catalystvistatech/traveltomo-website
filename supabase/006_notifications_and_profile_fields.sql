-- 006_notifications_and_profile_fields.sql
--
-- 1) Adds phone + bio columns to profiles so in-app profile edit has real
--    somewhere to store them.
-- 2) Introduces an in-app notifications feed so the home header badge and
--    NotificationsView have real unread data instead of hardcoded numbers.

-- 1. Profile contact fields ---------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS bio   TEXT;

-- 2. Notifications table ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN (
    'challenge_unlocked',
    'challenge_verified',
    'reward_ready',
    'merchant_status',
    'system'
  )),
  title       TEXT NOT NULL,
  body        TEXT,
  icon        TEXT,                   -- optional SF Symbol name
  deeplink    TEXT,                   -- optional app route
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins/superadmins can see all notifications for support purposes.
DROP POLICY IF EXISTS "Admins read all notifications" ON public.notifications;
CREATE POLICY "Admins read all notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

-- System / service-role code can write notifications directly; no insert
-- policy for end users. Server actions use the service role when fanning
-- out notifications (e.g. merchant verifying a completion).

-- 3. Helper RPCs --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unread_notification_count(p_user UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.notifications
  WHERE user_id = p_user AND read_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.unread_notification_count(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_user UUID, p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated INTEGER;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    UPDATE public.notifications
       SET read_at = now()
     WHERE user_id = p_user AND read_at IS NULL;
  ELSE
    UPDATE public.notifications
       SET read_at = now()
     WHERE user_id = p_user
       AND read_at IS NULL
       AND id = ANY(p_ids);
  END IF;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID, UUID[]) TO authenticated;
