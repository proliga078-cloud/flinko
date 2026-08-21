-- Defense-in-depth: tighten EXECUTE on SECURITY DEFINER functions that have
-- no legitimate reason to be callable by roles broader than needed.
-- NOTE: is_admin() and my_request_delay_minutes() are intentionally left
-- untouched — they are evaluated inside RLS policies (e.g. requests_select,
-- admin_all_ad_slots) for the anon role, and revoking EXECUTE there would
-- break public reads on those tables.
-- NOTE: auto_away_reply(), grant_referral_credit(), grant_review_credit()
-- are trigger functions (RETURNS trigger). Postgres already refuses to
-- invoke these directly outside real trigger context ("trigger functions
-- can only be called as triggers"), so their EXECUTE grant is not a real
-- attack surface and is left alone to avoid any risk to trigger firing.

-- Admin-only reporting RPCs: already gated internally by is_admin(), but
-- anonymous callers have no legitimate reason to call them at all.
REVOKE EXECUTE ON FUNCTION public.admin_get_signups_daily() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_get_site_visits_daily() FROM anon;

-- Buying an ad slot requires a logged-in professional with a credits
-- balance; anon calls always fail internally, but there's no reason to
-- expose the RPC to anon at all.
REVOKE EXECUTE ON FUNCTION public.buy_ad_slot(integer, text, text) FROM anon;

-- Maintenance-only function (expires manual plans past their end date).
-- Not tied to any specific user, no legitimate client call site.
REVOKE EXECUTE ON FUNCTION public.expire_manual_plans() FROM anon, authenticated;

-- Returns the current session's own email; meaningless for anon.
REVOKE EXECUTE ON FUNCTION public.my_email() FROM anon;

-- Already require auth.uid() internally (fixed earlier); revoke anon
-- EXECUTE too as an extra layer.
REVOKE EXECUTE ON FUNCTION public.get_market_insights(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_price_suggestion(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_response_time(uuid) FROM anon;
