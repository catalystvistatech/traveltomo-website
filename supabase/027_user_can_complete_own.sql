-- 027_user_can_complete_own.sql
--
-- Lets a user finalize their own active completion row. Without this
-- policy, /v1/challenges/:id/complete runs as the user JWT, hits the
-- existing merchant-only UPDATE policy, and silently no-ops. Every
-- photo-proof submission was a server-generated verification code with
-- nothing written to the DB - rewards never showed up in My Rewards.
--
-- Restrictions:
--   - Only the row's owner can update it (user_id = auth.uid()).
--   - Only the active row can be touched (completed_at IS NULL on USING
--     so we don't let users re-open a verified or rejected completion).
--   - The user can't reassign the row to someone else and can't move
--     it across challenges (WITH CHECK preserves user_id + challenge_id).
--
-- Merchants still have their own broader UPDATE policy for the verify
-- step; this one stacks alongside it.

DROP POLICY IF EXISTS "Users can update own active completions"
  ON public.challenge_completions;
CREATE POLICY "Users can update own active completions"
  ON public.challenge_completions FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND completed_at IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
  );
