-- 050_eager_skip_refill_cron.sql
--
-- Skips refill every 3 hours, but the refill was LAZY: the stored
-- profiles.free_skips_used only reset inside refill_free_skips_if_due()
-- (called on consume) or was papered over at read time by
-- skip_token_status(). Any surface that mirrored the stored counters —
-- older app builds mid-session, cached payloads — kept showing 0 skips
-- days after the pool should have renewed (reported by a tester whose
-- pool sat exhausted for a day).
--
-- Make the refill EAGER: a pg_cron job resets every due pool so the
-- stored row itself is fresh within minutes of the 3-hour mark, for
-- every reader, on every build. The lazy read/consume paths stay as a
-- zero-latency fallback. NULL last_skip_refill_at (older rows) counts
-- as due. Safe to re-run.

CREATE OR REPLACE FUNCTION public.refill_due_skip_pools()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
     SET free_skips_used = 0,
         last_skip_refill_at = now()
   WHERE free_skips_used > 0
     AND (
       last_skip_refill_at IS NULL
       OR last_skip_refill_at + INTERVAL '3 hours' <= now()
     );
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('refill-skip-pools');
EXCEPTION WHEN OTHERS THEN
  NULL; -- no existing job
END $$;

SELECT cron.schedule(
  'refill-skip-pools',
  '*/10 * * * *',
  'SELECT public.refill_due_skip_pools();'
);

-- Run once now so every currently-due pool renews immediately.
SELECT public.refill_due_skip_pools();
