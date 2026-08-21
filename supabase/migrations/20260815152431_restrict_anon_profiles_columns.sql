-- Critical fix: unauthenticated (anon) requests could read every column of
-- public.profiles, including stripe_customer_id, stripe_subscription_id,
-- credits, is_admin, approved, suspended, plan_expires_at, notify_email, etc.
-- Restrict anon to only the columns that are meant to be public-facing
-- (professional listing / profile page). Authenticated role keeps full
-- column access for now since the app's own dashboard reads its own
-- private fields directly from this table (a follow-up should move that
-- to a dedicated RPC / view so authenticated users can't read other
-- users' private columns either).

REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id, name, bio, photo_url, category, location, website, verified, created_at,
  cover_url, slug, weekly_schedule, specialties, certifications, languages,
  has_insurance, unavailable_until, unavailable_message, experience_years,
  account_type, avg_response_minutes, response_sample_count, plan
) ON public.profiles TO anon;
