-- 036_close_out_verified_completions.sql
--
-- Data fix: historically, verifying a stop set verification_status='verified'
-- (and sometimes player_status) but never set `completed_at`, and the
-- dashboard verify path didn't set player_status at all. That left finished
-- stops in a half "in-flight" state (completed_at IS NULL), which made the
-- accept route (`/v1/challenges/:id/accept`) treat them as an ongoing stop
-- and block the player from starting ANY new stop in the quest.
--
-- Going forward both verify paths set completed_at + player_status. This
-- migration repairs the existing rows. Safe to re-run.

-- Verified -> claimed, with a completion timestamp.
UPDATE public.challenge_completions
SET completed_at = COALESCE(completed_at, verified_at, now()),
    player_status = 'claimed'
WHERE verification_status = 'verified'
  AND (completed_at IS NULL OR player_status <> 'claimed');

-- Rejected -> forfeited (becomes rollable again), no longer in-flight.
UPDATE public.challenge_completions
SET completed_at = COALESCE(completed_at, verified_at, now()),
    player_status = 'forfeited'
WHERE verification_status = 'rejected'
  AND (completed_at IS NULL OR player_status <> 'forfeited');
