-- 025_scale_indexes.sql
--
-- Indexes the scale audit (2026-05-24) identified as missing on hot
-- quest-flow paths. Every one of these supports a real query in
-- `src/app/v1/**` or `src/lib/challenge-progress.ts`. None of them
-- duplicate existing indexes - verified against 001/004/018/019.
--
-- Also dedupes the leftover duplicate (user_id, challenge_id) rows
-- with completed_at IS NULL left behind by the SELECT-then-INSERT
-- race in /v1/challenges/:id/accept, so the partial unique index can
-- be created cleanly.

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, challenge_id
           ORDER BY accepted_at DESC, id DESC
         ) AS rn
    FROM public.challenge_completions
   WHERE completed_at IS NULL
)
DELETE FROM public.challenge_completions
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- /v1/recommendations completions post-fetch + /v1/me/rewards ordering.
-- Today these queries fall back to `idx_completions_user(user_id)` and
-- sort on the heap.
CREATE INDEX IF NOT EXISTS idx_completions_user_accepted
  ON public.challenge_completions (user_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_completions_user_completed
  ON public.challenge_completions (user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- Child-stop lookup in lib/challenge-progress.ts and the embedded
-- `children:challenges!travel_challenge_id` PostgREST select on
-- /v1/travel-challenges/:id. Partial index keeps it small because
-- non-live stops are noise.
CREATE INDEX IF NOT EXISTS idx_challenges_travel_status
  ON public.challenges (travel_challenge_id, status)
  WHERE status IN ('live','approved');

-- Race-fix for /v1/challenges/:id/accept. Today the route does
-- SELECT-then-INSERT to dedupe in-flight acceptances per user+challenge;
-- two parallel requests can both win the SELECT and both INSERT. This
-- partial unique index forces serialization at the DB layer so an
-- ON CONFLICT clause can collapse retries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_completions_one_active_per_challenge
  ON public.challenge_completions (user_id, challenge_id)
  WHERE completed_at IS NULL;

-- Pre-req for spatial filtering. The /v1/recommendations and
-- /v1/travel-challenges routes haversine-filter in Node today; this
-- supports moving that to a SQL bounding-box predicate when we do the
-- PostGIS migration. Partial because unverified businesses never
-- surface in the traveler-facing list.
CREATE INDEX IF NOT EXISTS idx_businesses_location_approved
  ON public.businesses (latitude, longitude)
  WHERE verification_status = 'approved';
