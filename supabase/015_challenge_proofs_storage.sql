-- 015_challenge_proofs_storage.sql
--
-- Public-read storage bucket for challenge proof photos. Files live at
-- challenge-proofs/{user_id}/{challenge_id}-{timestamp}.jpg so merchants
-- can view them via the existing /admin/completions queue without having
-- to mint signed URLs. Path is virtually unguessable.

INSERT INTO storage.buckets (id, name, public)
VALUES ('challenge-proofs', 'challenge-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Users upload challenge proofs" ON storage.objects;
CREATE POLICY "Users upload challenge proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'challenge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Anyone read challenge proofs" ON storage.objects;
CREATE POLICY "Anyone read challenge proofs"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'challenge-proofs');

DROP POLICY IF EXISTS "Users update own challenge proofs" ON storage.objects;
CREATE POLICY "Users update own challenge proofs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'challenge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'challenge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own challenge proofs" ON storage.objects;
CREATE POLICY "Users delete own challenge proofs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'challenge-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
