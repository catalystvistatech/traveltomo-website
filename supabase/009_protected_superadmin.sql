-- ============================================================
-- TravelTomo: Protected superadmin account
--
-- catalystvistatech@gmail.com is permanently superadmin.
-- A BEFORE UPDATE trigger blocks any attempt to change its
-- role — regardless of who runs the UPDATE (service_role
-- included, because the trigger runs SECURITY DEFINER-level
-- checks via auth.users, not the caller's role).
-- ============================================================

-- 1. Ensure the account exists and is superadmin right now.
--    Uses a DO block so this is idempotent when re-run.
DO $$
DECLARE
  _uid UUID;
BEGIN
  SELECT id INTO _uid
  FROM auth.users
  WHERE email = 'catalystvistatech@gmail.com'
  LIMIT 1;

  IF _uid IS NULL THEN
    RAISE NOTICE 'catalystvistatech@gmail.com not found — will be set to superadmin on first sign-up via trigger below.';
    RETURN;
  END IF;

  -- Set profile role
  UPDATE public.profiles
  SET role = 'superadmin'
  WHERE id = _uid AND role IS DISTINCT FROM 'superadmin';

  -- Sync to app_metadata so JWT reflects it immediately
  UPDATE auth.users
  SET raw_app_meta_data =
        COALESCE(raw_app_meta_data, '{}'::jsonb)
        || '{"role":"superadmin"}'::jsonb
  WHERE id = _uid;
END;
$$;

-- 2. Trigger function: block role demotions for the protected email.
--    Also fires when a NEW account with this email is first inserted
--    (via handle_new_user), so we override the default 'user' role.
CREATE OR REPLACE FUNCTION public.protect_superadmin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _email TEXT;
BEGIN
  SELECT email INTO _email
  FROM auth.users
  WHERE id = NEW.id
  LIMIT 1;

  IF _email = 'catalystvistatech@gmail.com' THEN
    NEW.role := 'superadmin';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Attach to BEFORE INSERT (covers first sign-up) and
--    BEFORE UPDATE (covers any role-change attempt).
DROP TRIGGER IF EXISTS enforce_superadmin_role ON public.profiles;
CREATE TRIGGER enforce_superadmin_role
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_superadmin_role();
