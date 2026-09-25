-- 055_quest_templates_admin_write.sql
--
-- BUG: `saveQuestAsTemplate` is the recovery snapshot that
-- `deleteTravelChallenge` relies on, but it filed the snapshot under the
-- CALLER instead of the quest's owner. When staff deleted a merchant's quest
-- the snapshot landed in the staff member's own library, and the merchant
-- could never restore their quest.
--
-- The code fix files the snapshot under the quest's owner. That alone is not
-- enough: `quest_templates` only allows writes where
-- `merchant_id = auth.uid()` ("Merchants manage own quest templates"), and
-- admins hold SELECT only. So a staff member writing into another owner's
-- library would have been REJECTED - turning "wrong library" into
-- "snapshot silently lost".
--
-- This grants admin/superadmin full write on quest_templates, mirroring the
-- policies the platform already has on challenges ("Admins can manage all
-- challenges"), travel_challenges ("Admins manage travel challenges") and
-- rewards ("Admins can manage all rewards write"). It brings quest_templates
-- in line with the tables whose content it snapshots.
--
-- Role is checked both via JWT app_metadata and via profiles
-- (current_user_role()), the same belt-and-braces form the rewards policy
-- uses, so it is robust to either source lagging the other.
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Admins manage all quest templates" ON public.quest_templates;
CREATE POLICY "Admins manage all quest templates"
  ON public.quest_templates FOR ALL
  TO authenticated
  USING (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = ANY (ARRAY['admin','superadmin'])
    OR public.current_user_role() = ANY (ARRAY['admin','superadmin'])
  )
  WITH CHECK (
    ((auth.jwt() -> 'app_metadata') ->> 'role') = ANY (ARRAY['admin','superadmin'])
    OR public.current_user_role() = ANY (ARRAY['admin','superadmin'])
  );
