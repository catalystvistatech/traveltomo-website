-- 048_recommendations_exclude_dead_quests.sql
--
-- The dice-roll pool (`recommended_challenges`) only filtered on the child
-- challenge's own status (c.status = 'live'), never the parent quest's.
-- When a quest expires (migration 046 flips it to 'expired' after its
-- date_range_end) its child stops stay 'live', so travelers could still
-- roll a stop whose acceptance the API then rejects (the accept route
-- guards on quest status/date window). Surfaced by the Palo Verde Resort
-- quest expiring on 2026-06-30 while its 6 stops kept appearing.
--
-- Add the parent-quest gate: standalone challenges (no parent quest) are
-- untouched; quest stops only surface while their quest is live/approved —
-- the same set the accept route allows. Safe to re-run.

CREATE OR REPLACE VIEW public.recommended_challenges AS
 SELECT c.id,
    c.merchant_id,
    c.travel_challenge_id,
    c.title,
    c.description,
    c.instructions,
    c.type,
    c.verification_type,
    c.xp_reward,
    c.radius_meters,
    c.latitude,
    c.longitude,
    c.establishment_type,
    c.time_of_day_start,
    c.time_of_day_end,
    c.days_of_week,
    c.max_completions,
    c.current_completions,
    c.duration_minutes,
    b.id AS business_id,
    b.name AS business_name,
    b.latitude AS business_latitude,
    b.longitude AS business_longitude,
    b.establishment_type AS business_establishment_type,
    b.service_radius_meters,
    merchant_is_open_now(b.id) AS is_open_now,
    merchant_has_active_promotion(c.merchant_id) AS is_promoted
   FROM challenges c
     LEFT JOIN travel_challenges tc ON tc.id = c.travel_challenge_id
     LEFT JOIN LATERAL ( SELECT bb.id,
            bb.merchant_id,
            bb.name,
            bb.description,
            bb.address,
            bb.city,
            bb.category,
            bb.logo_url,
            bb.contact_email,
            bb.contact_phone,
            bb.website,
            bb.is_verified,
            bb.created_at,
            bb.updated_at,
            bb.latitude,
            bb.longitude,
            bb.establishment_type,
            bb.verification_status,
            bb.verified_at,
            bb.verified_by,
            bb.verification_notes,
            bb.service_radius_meters,
            bb.hours,
            bb.timezone,
            bb.google_place_id
           FROM businesses bb
          WHERE bb.merchant_id = c.merchant_id
            AND bb.verification_status = 'approved'::business_verification_status
            AND (tc.business_id IS NULL OR bb.id = tc.business_id)
          ORDER BY (
                CASE
                    WHEN tc.business_id IS NOT NULL AND bb.id = tc.business_id THEN 0
                    ELSE 1
                END), bb.created_at
         LIMIT 1) b ON true
  WHERE c.status = 'live'::text
    AND b.verification_status = 'approved'::business_verification_status
    AND (c.max_completions IS NULL OR c.current_completions < c.max_completions)
    AND (c.travel_challenge_id IS NULL OR tc.status = ANY (ARRAY['live'::text, 'approved'::text]));
