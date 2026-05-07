-- 011_multi_business.sql
--
-- Allow merchants to own more than one business.
-- The original schema had UNIQUE (merchant_id) on the businesses table,
-- which limited every merchant account to a single business listing.
-- Dropping that constraint is all the DB needs; the businesses.id PK
-- already uniquely identifies each row and all FK references (e.g.
-- travel_challenges.business_id) already point to the PK, not merchant_id.

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_merchant_id_key;

-- Also add a superadmin write policy so the admin UI can insert / update
-- businesses on behalf of merchants using the service-role client.
DROP POLICY IF EXISTS "Admins manage all businesses" ON public.businesses;
CREATE POLICY "Admins manage all businesses"
  ON public.businesses FOR ALL
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));
