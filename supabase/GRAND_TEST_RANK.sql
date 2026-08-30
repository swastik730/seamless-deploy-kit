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
