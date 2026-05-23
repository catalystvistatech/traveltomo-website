-- 022_quest_skip_revoke_anon.sql
--
-- Lock consume_quest_skip down so only signed-in users can call it.
-- Travel-quest skips are tied to an authenticated session and the RPC
-- already enforces user_id ownership, but anon should never be able to
-- reach it via /rest/v1/rpc/consume_quest_skip.

REVOKE EXECUTE ON FUNCTION public.consume_quest_skip(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.consume_quest_skip(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_quest_skip(UUID, UUID) TO authenticated;
