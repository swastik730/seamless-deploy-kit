-- Plan feature parity — run once in the Supabase SQL editor.
--
-- trial3 / month1 / year1 are the same product at different durations, so they
-- advertise the SAME feature list (the full yearly list). Only `maxpro` differs,
-- adding the AI-tutor tier extras. Prices and durations are unchanged.

UPDATE public.plans
SET features = '[
  "3D models library",
  "Concept videos",
  "Ad-free experience",
  "All mock tests",
  "NCERT solutions",
  "Progress analytics",
  "Formula sheets"
]'::jsonb
WHERE id IN ('trial3', 'month1', 'year1');

UPDATE public.plans
SET features = '[
  "Everything in Yearly",
  "AI doubt-solving tutor",
  "Priority support",
  "Blue tick on your name",
  "Early access to new features"
]'::jsonb
WHERE id = 'maxpro';

SELECT id, name, price_paise, duration_days, tier, features FROM public.plans ORDER BY sort;
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
-- Grand Test / Simulator live ranking.
-- Run this once in your Supabase project → SQL Editor (after FULL_SETUP.sql).
--
-- get_test_rank(_test_id) returns ONE row per student: their best net-percent
-- score on that paper. Net percent uses the same marking as the app
-- (+1 correct, -0.25 wrong, skipped = 0), clamped to 0..100.
--
-- SECURITY DEFINER so a signed-in student can see the anonymised score list of
-- every other student for that paper (RLS on public.attempts only exposes own
-- rows). Nothing but the opaque user_id and the score is returned.

CREATE OR REPLACE FUNCTION public.get_test_rank(_test_id text)
RETURNS TABLE (user_id uuid, best_percent numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.user_id,
    MAX(
      GREATEST(
        0,
        LEAST(
          100,
          ROUND(
            (
              (a.correct::numeric
                - (GREATEST(a.total - a.correct - a.unanswered, 0)::numeric * 0.25)
              ) / NULLIF(a.total, 0)::numeric
            ) * 100
          , 1)
        )
      )
    ) AS best_percent
  FROM public.attempts a
  WHERE a.test_id = _test_id
    AND a.total > 0
  GROUP BY a.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_test_rank(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_test_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_test_rank(text) TO service_role;

-- ============================================================
-- 4) FIX: a failed payment attempt must never cancel an active plan
--    (Razorpay sends payment.failed for earlier tries on the same order)
-- ============================================================
CREATE OR REPLACE FUNCTION public.server_mark_subscription(_token text, _status text, _order_id text DEFAULT NULL, _payment_id text DEFAULT NULL, _expire_now boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _now timestamptz := now();
BEGIN
  IF NOT public.server_token_ok(_token) THEN
    RAISE EXCEPTION 'invalid server token';
  END IF;
  IF _status NOT IN ('pending','failed','cancelled','refunded') THEN
    RAISE EXCEPTION 'unsupported status';
  END IF;
  UPDATE public.subscriptions
  SET status = _status,
      expires_at = CASE WHEN _expire_now THEN _now ELSE expires_at END,
      updated_at = _now
  WHERE ((_payment_id IS NOT NULL AND razorpay_payment_id = _payment_id)
      OR (_payment_id IS NULL AND _order_id IS NOT NULL AND razorpay_order_id = _order_id))
    AND (_status NOT IN ('failed','pending') OR status <> 'active');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.server_mark_subscription(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.server_mark_subscription(text, text, text, text, boolean) TO anon, authenticated;

-- Repair any plan that was wrongly switched off by a failed retry:
UPDATE public.subscriptions
SET status = 'active', updated_at = now()
WHERE status = 'failed'
  AND razorpay_payment_id IS NOT NULL
  AND expires_at IS NOT NULL
  AND expires_at > now();
