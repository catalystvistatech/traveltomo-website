-- 023_challenge_proofs_case_insensitive.sql
--
-- Storage policies on `challenge-proofs` compared the folder prefix to
-- `auth.uid()::text` directly, which only matches when the client
-- lowercases the UUID. iOS's `UUID.uuidString` is uppercase by default,
-- so the first real proof upload failed with "new row violates row-
-- level security policy" until the Swift client started lowercasing
-- the path.
--
-- UUIDs are case-insensitive per the spec, so the policy should be too.
-- This migration normalizes the folder side with `lower()` so any
-- future client (Android, web) is forgiving of casing.

DROP POLICY IF EXISTS "Users upload challenge proofs" ON storage.objects;
CREATE POLICY "Users upload challenge proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'challenge-proofs'
    AND lower((storage.foldername(name))[1]) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own challenge proofs" ON storage.objects;
CREATE POLICY "Users update own challenge proofs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'challenge-proofs'
    AND lower((storage.foldername(name))[1]) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'challenge-proofs'
    AND lower((storage.foldername(name))[1]) = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own challenge proofs" ON storage.objects;
CREATE POLICY "Users delete own challenge proofs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'challenge-proofs'
    AND lower((storage.foldername(name))[1]) = auth.uid()::text
  );
