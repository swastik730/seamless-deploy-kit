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
