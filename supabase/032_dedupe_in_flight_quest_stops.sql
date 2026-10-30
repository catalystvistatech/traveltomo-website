-- Dedupe in-flight quest stops (one ongoing stop per quest)
--
-- The lock-in rule is "a player works one stop at a time per quest",
-- but the only DB guard was a partial unique index on
-- (user_id, challenge_id) - which permits one in-flight row PER STOP,
-- not one per quest. So a player could roll + accept several different
-- stops of the same quest and accumulate multiple `ongoing` rows
-- (e.g. Elanie had St. Vincent Ferrer + Bayambang Plaza both ongoing).
--
-- The accept route now rejects a second in-flight stop per quest. This
-- migration cleans up the existing duplicates: keep the most recently
-- accepted in-flight stop per (user, quest) and delete the older
-- in-flight rows, returning those stops to the rollable pool.
--
-- Only touches rows with completed_at IS NULL (accepted-but-not-
-- submitted). Submitted / verified / claimed rows have completed_at set
-- and are never affected.

WITH ranked AS (
  SELECT
    cc.id,
    row_number() OVER (
      PARTITION BY cc.user_id, ch.travel_challenge_id
      ORDER BY cc.accepted_at DESC NULLS LAST, cc.id DESC
    ) AS rn
  FROM public.challenge_completions cc
  JOIN public.challenges ch ON ch.id = cc.challenge_id
  WHERE cc.completed_at IS NULL
    AND ch.travel_challenge_id IS NOT NULL
)
DELETE FROM public.challenge_completions
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
