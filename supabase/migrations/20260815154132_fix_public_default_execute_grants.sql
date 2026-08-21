-- Found via re-testing: Postgres grants EXECUTE to the PUBLIC pseudo-role
-- by default on CREATE FUNCTION, and this project's default privileges
-- also auto-grant EXECUTE to anon/authenticated on new/replaced functions
-- in the public schema. My earlier REVOKE ... FROM anon calls did not
-- account for the PUBLIC grant, so buy_ad_slot/expire_manual_plans/
-- my_email were still callable by anon through PUBLIC, and the functions
-- I recreated (get_market_insights, get_price_suggestion,
-- recompute_response_time, spotlight_pros, get_my_profile) silently got a
-- fresh PUBLIC + anon + authenticated grant on replace. Explicitly revoke
-- PUBLIC everywhere and re-apply only the intended per-role grants.

REVOKE EXECUTE ON FUNCTION public.buy_ad_slot(integer, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.buy_ad_slot(integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.buy_ad_slot(integer, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_manual_plans() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_manual_plans() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.my_email() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.my_email() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_email() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_market_insights(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_market_insights(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_market_insights(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_price_suggestion(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_price_suggestion(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_price_suggestion(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.recompute_response_time(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_response_time(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recompute_response_time(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.spotlight_pros(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spotlight_pros(integer) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- admin_get_signups_daily / admin_get_site_visits_daily never had a PUBLIC
-- grant, confirmed working correctly already, but revoke PUBLIC too for
-- certainty/defense in depth.
REVOKE EXECUTE ON FUNCTION public.admin_get_signups_daily() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_site_visits_daily() FROM PUBLIC;
