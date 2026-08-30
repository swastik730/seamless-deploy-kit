-- ============================================================
-- FIX: "Email not confirmed" on username-only signup
-- Run this once in Supabase Dashboard -> SQL Editor (project ctbztladyklnuiifdlcs).
--
-- The app creates accounts with a synthetic email (<username>@boardbuddy.app)
-- that can never receive a confirmation mail. If "Confirm email" is enabled,
-- signUp() returns no session and the follow-up signInWithPassword() fails
-- with "Email not confirmed".
--
-- 1) BEFORE INSERT trigger on auth.users auto-confirms these addresses.
-- 2) confirm_signup_email() repairs accounts that are already stuck.
-- 3) Backfill confirms every existing username-only account.
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_confirm_app_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL
     AND lower(NEW.email) LIKE '%@boardbuddy.app'
     AND NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
    NEW.confirmation_token := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_confirm_app_signup ON auth.users;
CREATE TRIGGER auto_confirm_app_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_app_signup();

-- Repair helper: confirms one already-created synthetic account.
CREATE OR REPLACE FUNCTION public.confirm_signup_email(_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target text := lower(trim(_username)) || '@boardbuddy.app';
  affected integer := 0;
BEGIN
  IF _username IS NULL OR trim(_username) = '' THEN RETURN false; END IF;

  UPDATE auth.users
  SET email_confirmed_at = now(),
      confirmation_token = '',
      updated_at = now()
  WHERE lower(email) = target
    AND email_confirmed_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_signup_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_signup_email(text) TO anon, authenticated;

-- Backfill: confirm every existing username-only account.
UPDATE auth.users
SET email_confirmed_at = now(), confirmation_token = ''
WHERE email_confirmed_at IS NULL
  AND lower(email) LIKE '%@boardbuddy.app';
