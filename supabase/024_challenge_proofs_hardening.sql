-- 024_challenge_proofs_hardening.sql
--
-- Locks down the public read on `challenge-proofs` and adds a per-file
-- size ceiling. Without these:
--   * `storage.objects` SELECT was granted to role `public`, which
--     means an anonymous client could `storage.from(...).list('')` and
--     enumerate every traveler's user_id + proof file names.
--   * The bucket had no `file_size_limit`, so a single bad actor could
--     balloon storage uploading 5 MB selfies in a loop.
--
-- After this migration:
--   * Reads require `authenticated` (per-object public URL access still
--     works for any signed-in user; merchants on the web dashboard are
--     signed in too).
--   * Anonymous traffic can no longer list bucket contents.
--   * Each upload is capped at 1 MB. Real proofs after the iOS resize
--     (1000 px, q=0.75) come in around 150-300 KB, so the cap catches
--     abuse without rejecting normal flows.

ALTER TABLE storage.buckets
   SET file_size_limit = 1048576  -- 1 MB
 WHERE id = 'challenge-proofs';

DROP POLICY IF EXISTS "Anyone read challenge proofs" ON storage.objects;
CREATE POLICY "Authenticated read challenge proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'challenge-proofs');
