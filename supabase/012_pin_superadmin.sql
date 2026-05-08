-- 012_pin_superadmin.sql
-- Ensure catalystvistatech@gmail.com is always a superadmin.
-- A trigger fires before every INSERT OR UPDATE on profiles so any
-- accidental role change is immediately reverted.

CREATE OR REPLACE FUNCTION public.enforce_superadmin_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM auth.users
  WHERE id = NEW.id;

  IF v_email = 'catalystvistatech@gmail.com' AND NEW.role <> 'superadmin' THEN
    NEW.role := 'superadmin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_superadmin_accounts_trigger ON public.profiles;
CREATE TRIGGER enforce_superadmin_accounts_trigger
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_superadmin_accounts();

-- Fix the role immediately in case it was previously changed.
UPDATE public.profiles
SET role = 'superadmin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'catalystvistatech@gmail.com'
);
