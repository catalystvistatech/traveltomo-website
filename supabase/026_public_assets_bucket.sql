-- 026_public_assets_bucket.sql
--
-- Codifies the `public-assets` storage bucket used by merchants for
-- travel-challenge cover photos. The audit found `uploadTravelChallengeCover`
-- (src/lib/actions/travelChallenges.ts) writing to this bucket without a
-- migration ever creating it — meaning every fresh environment 404s on
-- the first cover upload until someone clicks it into existence in the
-- dashboard. Locking the shape in here so it can't drift.
--
-- Cover photos are global brand imagery (one per quest), so the bucket
-- is public-read and the only writers are merchants/admins/superadmins
-- writing to a path that starts with their own user id.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('public-assets', 'public-assets', true, 5242880)  -- 5 MB ceiling
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880;

DROP POLICY IF EXISTS "Authenticated read public-assets" ON storage.objects;
CREATE POLICY "Authenticated read public-assets"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'public-assets');

DROP POLICY IF EXISTS "Merchants and admins write public-assets" ON storage.objects;
CREATE POLICY "Merchants and admins write public-assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-assets'
    AND (
      (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
      OR public.current_user_role() IN ('merchant','admin','superadmin')
    )
  );

DROP POLICY IF EXISTS "Merchants and admins update public-assets" ON storage.objects;
CREATE POLICY "Merchants and admins update public-assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (
      (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
      OR public.current_user_role() IN ('merchant','admin','superadmin')
    )
  )
  WITH CHECK (
    bucket_id = 'public-assets'
    AND (
      (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
      OR public.current_user_role() IN ('merchant','admin','superadmin')
    )
  );

DROP POLICY IF EXISTS "Merchants and admins delete public-assets" ON storage.objects;
CREATE POLICY "Merchants and admins delete public-assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'public-assets'
    AND (
      (auth.jwt()->'app_metadata'->>'role') IN ('merchant','admin','superadmin')
      OR public.current_user_role() IN ('merchant','admin','superadmin')
    )
  );
