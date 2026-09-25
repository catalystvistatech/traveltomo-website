-- Re-live orphaned quest stops
--
-- Stops added to a quest AFTER it was published stayed `draft` forever:
-- addChildChallenge always inserted with status='draft', and the publish
-- flow (submitTravelChallengeForReview) only runs from draft/rejected so
-- it never re-ran to flip them live. The iOS app only counts `live`
-- stops, so a 6-stop quest showed "0 / 2 stops" - only the stops that
-- existed at publish time.
--
-- The app code is fixed to inherit the parent's live status going
-- forward. This migration backfills the existing orphaned draft stops:
-- any `draft` child whose parent quest is already live/approved is
-- promoted to `live`.

UPDATE public.challenges c
SET status = 'live',
    approved_at = COALESCE(c.approved_at, now())
FROM public.travel_challenges tc
WHERE c.travel_challenge_id = tc.id
  AND tc.status IN ('live', 'approved')
  AND c.status = 'draft';
