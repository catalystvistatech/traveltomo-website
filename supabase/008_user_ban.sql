-- 008: User ban support + admin-friendly profile fields
--
-- Adds banned_at timestamp to profiles so admins can ban users without
-- hard-deleting their data. A banned user's JWT still exists but every
-- RLS policy can check profiles.banned_at IS NULL before granting access.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ban_reason  TEXT,
  ADD COLUMN IF NOT EXISTS email       TEXT; -- denormalized from auth.users for admin search

-- Backfill email from auth.users for existing rows
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Keep email in sync whenever auth.users.email changes (e.g. after OTP verify)
CREATE OR REPLACE FUNCTION public.sync_email_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles SET email = NEW.email WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_email_to_profile();

-- Also sync email on new signups (handle_new_user already fires; add email)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, role, merchant_request_status, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'requested_role', 'user') = 'merchant' THEN 'merchant' ELSE 'user' END,
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'requested_role', 'user') = 'merchant' THEN 'pending' ELSE 'none' END,
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'role',
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'requested_role', 'user') = 'merchant' THEN 'merchant' ELSE 'user' END
  )
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Admins can see/update any profile (required for user management page)
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin', 'superadmin'));

-- Admins can read all profiles (SELECT already exists; make sure it covers banned_at)
-- The existing "Admins can view all profiles" policy covers this column automatically.

CREATE INDEX IF NOT EXISTS idx_profiles_banned_at ON public.profiles(banned_at)
  WHERE banned_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

COMMENT ON COLUMN public.profiles.banned_at IS 'Set to now() to ban a user. NULL = active.';
COMMENT ON COLUMN public.profiles.email IS 'Denormalized from auth.users for admin search/display without a join.';
