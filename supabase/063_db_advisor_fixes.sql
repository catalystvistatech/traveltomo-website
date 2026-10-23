-- 063_db_advisor_fixes.sql
--
-- Fixes from the Supabase security + performance advisors (2026-10-23).
--
-- SECURITY
-- 1. SECURITY DEFINER functions were executable by anon/authenticated
--    straight through /rest/v1/rpc. The ones taking p_user TRUST it, so any
--    caller could e.g. grant_skip_from_ad / consume_skip_token for another
--    user, overwrite anyone's location (touch_user_location), spam them
--    with notifications (notify_user_of_unseen_nearby_quests) or read their
--    unread count. The /v1 routes now call these with the service role after
--    authenticating the user, so EXECUTE is revoked from PUBLIC/anon/
--    authenticated. Trigger functions are included (EXECUTE isn't checked
--    when a trigger fires) and the cron jobs run as postgres.
--    current_user_role() stays callable: RLS policies use it.
--    (057/062 revoked from anon/authenticated only, but EXECUTE is granted
--    to PUBLIC by default, so those revokes never took effect.)
-- 2. recommended_challenges was SECURITY DEFINER, bypassing RLS. It now
--    runs as the caller (verified to return the same 18 rows to a traveler).
-- 3. admin_act_as_audit_is_append_only gets a fixed search_path.
--
-- PERFORMANCE
-- 4. 31 RLS policies called auth.uid()/auth.jwt() once PER ROW; wrapped in
--    (SELECT …) so Postgres evaluates them once per query (initplan).
--    Generated from the live pg_policies definitions; only the call is
--    wrapped, the logic is unchanged.
-- 5. Indexes for 10 unindexed foreign keys; drop a duplicate index.
--
-- Not changed here (needs a decision): "multiple permissive policies"
-- (36 tables/actions) and 14 unused indexes; Auth "leaked password
-- protection" is a dashboard toggle (Authentication → Policies).
--
-- Safe to re-run.

-- 1. Lock down SECURITY DEFINER functions ------------------------------------

REVOKE ALL ON FUNCTION public.admin_act_as_audit_is_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_challenge_xp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_quest_skip(p_user uuid, p_progress_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_skip_token(p_user uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_business_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_superadmin_accounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_merchant_subscriptions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_quests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_skip_from_ad(p_user uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_privileged_profile_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_travel_challenge_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_notifications_read(p_user uuid, p_ids uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_user_of_unseen_nearby_quests(p_user uuid, p_lat double precision, p_lng double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_superadmin_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_deleted_quests() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refill_due_skip_pools() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refill_free_skips_if_due(p_user uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.skip_token_status(p_user uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_business_place() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_email_to_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_role_to_app_metadata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_user_location(p_user uuid, p_lat double precision, p_lng double precision) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unread_notification_count(p_user uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_quest_skip(p_user uuid, p_progress_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_skip_token(p_user uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_merchant_subscriptions() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_quests() TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_skip_from_ad(p_user uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(p_user uuid, p_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_user_of_unseen_nearby_quests(p_user uuid, p_lat double precision, p_lng double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_deleted_quests() TO service_role;
GRANT EXECUTE ON FUNCTION public.refill_due_skip_pools() TO service_role;
GRANT EXECUTE ON FUNCTION public.refill_free_skips_if_due(p_user uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.skip_token_status(p_user uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_user_location(p_user uuid, p_lat double precision, p_lng double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.unread_notification_count(p_user uuid) TO service_role;

-- Functions added in 060/062 (their own revokes missed PUBLIC).
DO $$
BEGIN
  IF to_regprocedure('public.collect_stamp(text, uuid, double precision, double precision)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.collect_stamp(TEXT, UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.expire_storekit_unlimited()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.expire_storekit_unlimited() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- 2. View runs as the caller ---------------------------------------------------

ALTER VIEW public.recommended_challenges SET (security_invoker = on);

-- 3. Fixed search_path -----------------------------------------------------------

ALTER FUNCTION public.admin_act_as_audit_is_append_only() SET search_path = public, pg_temp;

-- 4. Evaluate auth.*() once per query in RLS -------------------------------------

ALTER POLICY "Merchants read own act-as audit" ON public.admin_act_as_audit USING ((merchant_id = (SELECT auth.uid())));
ALTER POLICY "Superadmins read own act-as sessions" ON public.admin_act_as_sessions USING (((actor_id = (SELECT auth.uid())) AND (current_user_role() = 'superadmin'::text)));
ALTER POLICY "Merchants can manage own business" ON public.businesses USING (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text])))) WITH CHECK (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text]))));
ALTER POLICY "Merchants can update completions for their challenges" ON public.challenge_completions USING ((challenge_id IN ( SELECT challenges.id FROM challenges WHERE (challenges.merchant_id = (SELECT auth.uid()))))) WITH CHECK ((challenge_id IN ( SELECT challenges.id FROM challenges WHERE (challenges.merchant_id = (SELECT auth.uid())))));
ALTER POLICY "Merchants can view completions for their challenges" ON public.challenge_completions USING ((challenge_id IN ( SELECT challenges.id FROM challenges WHERE (challenges.merchant_id = (SELECT auth.uid())))));
ALTER POLICY "Users can insert own completions" ON public.challenge_completions WITH CHECK (((user_id = (SELECT auth.uid())) AND (NOT (EXISTS ( SELECT 1 FROM challenges c WHERE ((c.id = challenge_completions.challenge_id) AND (c.merchant_id = (SELECT auth.uid()))))))));
ALTER POLICY "Users can update own active completions" ON public.challenge_completions USING (((user_id = (SELECT auth.uid())) AND (completed_at IS NULL))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Users can view own completions" ON public.challenge_completions USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "Merchants can manage own challenges" ON public.challenges USING (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text])))) WITH CHECK (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text]))));
ALTER POLICY "Users manage own favorites" ON public.favorites USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Merchants cancel own subscriptions" ON public.merchant_subscriptions USING ((merchant_id = (SELECT auth.uid()))) WITH CHECK ((merchant_id = (SELECT auth.uid())));
ALTER POLICY "Merchants read own subscriptions" ON public.merchant_subscriptions USING (((merchant_id = (SELECT auth.uid())) OR (current_user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))));
ALTER POLICY "Merchants start own subscriptions" ON public.merchant_subscriptions WITH CHECK (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text]))));
ALTER POLICY "Users read own notifications" ON public.notifications USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "Users update own notifications" ON public.notifications USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Users can update own profile" ON public.profiles USING (((SELECT auth.uid()) = id)) WITH CHECK (((SELECT auth.uid()) = id));
ALTER POLICY "Users can view own profile" ON public.profiles USING (((SELECT auth.uid()) = id));
ALTER POLICY "Admins read all quest templates" ON public.quest_templates USING (((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text])));
ALTER POLICY "Merchants manage own quest templates" ON public.quest_templates USING ((merchant_id = (SELECT auth.uid()))) WITH CHECK ((merchant_id = (SELECT auth.uid())));
ALTER POLICY "Merchants can view redemptions for their rewards" ON public.reward_redemptions USING ((reward_id IN ( SELECT rewards.id FROM rewards WHERE (rewards.merchant_id = (SELECT auth.uid())))));
ALTER POLICY "Users can insert own redemptions" ON public.reward_redemptions WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Users can view own redemptions" ON public.reward_redemptions USING ((user_id = (SELECT auth.uid())));
ALTER POLICY "Admins can manage all rewards write" ON public.rewards USING ((((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (current_user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text])))) WITH CHECK ((((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text])) OR (current_user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))));
ALTER POLICY "Merchants can manage own rewards" ON public.rewards USING ((merchant_id = (SELECT auth.uid()))) WITH CHECK ((merchant_id = (SELECT auth.uid())));
ALTER POLICY "Merchants read big-reward progress for own travel challenges" ON public.travel_challenge_progress USING (((travel_challenge_id IN ( SELECT travel_challenges.id FROM travel_challenges WHERE (travel_challenges.merchant_id = (SELECT auth.uid())))) OR ((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text]))));
ALTER POLICY "Merchants redeem big-reward for own travel challenges" ON public.travel_challenge_progress USING (((travel_challenge_id IN ( SELECT travel_challenges.id FROM travel_challenges WHERE (travel_challenges.merchant_id = (SELECT auth.uid())))) OR ((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text])))) WITH CHECK (((travel_challenge_id IN ( SELECT travel_challenges.id FROM travel_challenges WHERE (travel_challenges.merchant_id = (SELECT auth.uid())))) OR ((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text]))));
ALTER POLICY "Users manage own travel progress" ON public.travel_challenge_progress WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Users read own travel progress" ON public.travel_challenge_progress USING (((user_id = (SELECT auth.uid())) OR ((((SELECT auth.jwt()) -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'superadmin'::text]))));
ALTER POLICY "Users update own travel progress" ON public.travel_challenge_progress USING ((user_id = (SELECT auth.uid()))) WITH CHECK ((user_id = (SELECT auth.uid())));
ALTER POLICY "Merchants manage own travel challenges" ON public.travel_challenges USING (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text])))) WITH CHECK (((merchant_id = (SELECT auth.uid())) AND (current_user_role() = ANY (ARRAY['merchant'::text, 'admin'::text, 'superadmin'::text]))));
ALTER POLICY "Merchants read own invoices" ON public.xendit_invoices USING (((merchant_id = (SELECT auth.uid())) OR (current_user_role() = ANY (ARRAY['admin'::text, 'superadmin'::text]))));

-- 5. Indexes ----------------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_travel_challenges_business; -- duplicate of idx_travel_challenges_business_id

CREATE INDEX IF NOT EXISTS idx_businesses_verified_by ON public.businesses (verified_by);
CREATE INDEX IF NOT EXISTS idx_challenge_completions_verified_by ON public.challenge_completions (verified_by);
CREATE INDEX IF NOT EXISTS idx_challenge_templates_created_by ON public.challenge_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_challenges_template_id ON public.challenges (template_id);
CREATE INDEX IF NOT EXISTS idx_favorites_place_id ON public.favorites (place_id);
CREATE INDEX IF NOT EXISTS idx_places_created_by ON public.places (created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_banned_by ON public.profiles (banned_by);
CREATE INDEX IF NOT EXISTS idx_profiles_merchant_reviewed_by ON public.profiles (merchant_reviewed_by);
CREATE INDEX IF NOT EXISTS idx_travel_progress_big_reward_redeemed_by ON public.travel_challenge_progress (big_reward_redeemed_by);
CREATE INDEX IF NOT EXISTS idx_xendit_invoices_subscription_id ON public.xendit_invoices (subscription_id);
