-- 056_quest_templates_admin_policy_tighten.sql
--
-- Tightens the admin policy added in 055 so it matches the policies it
-- claims to mirror. 055 OR'd two role sources:
--     JWT app_metadata role  OR  current_user_role()   (profiles-backed)
--
-- That is wider than "Admins can manage all challenges" / "Admins manage
-- travel challenges" (016), which check current_user_role() ONLY. profiles
-- is the source of truth and updates instantly, so the JWT branch can never
-- ADD access for a legitimately promoted user - it can only EXTEND access
-- for a demoted one, who keeps full write on quest_templates until their
-- access token rotates. Drop the JWT branch.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Admins manage all quest templates" ON public.quest_templates;
CREATE POLICY "Admins manage all quest templates"
  ON public.quest_templates FOR ALL
  TO authenticated
  USING      (public.current_user_role() = ANY (ARRAY['admin','superadmin']))
  WITH CHECK (public.current_user_role() = ANY (ARRAY['admin','superadmin']));
