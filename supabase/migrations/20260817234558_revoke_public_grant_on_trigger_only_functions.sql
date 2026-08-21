-- A revogacao anterior (FROM anon, authenticated) nao bastou: as 4 funcoes
-- ainda tinham EXECUTE concedido a PUBLIC (visivel em pg_proc.proacl como
-- "=X/postgres"), que se aplica a qualquer role, incluindo anon/authenticated,
-- independentemente de revogacoes especificas a essas roles. Fecha-se agora
-- explicitamente a PUBLIC tambem. Continuam a funcionar normalmente como
-- triggers (o postgres role/dono mantem privilegio).
REVOKE EXECUTE ON FUNCTION public.auto_away_reply() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_referral_credit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_review_credit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.protect_privileged_profile_columns() FROM PUBLIC;
