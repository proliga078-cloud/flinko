-- Estas 4 funcoes SECURITY DEFINER sao usadas exclusivamente como triggers
-- internos (nunca chamadas via .rpc() pelo site). O linter de seguranca do
-- Supabase assinala-as como "publicamente executaveis" porque, por omissao,
-- toda a funcao no schema public fica exposta ao PostgREST. Retirar o EXECUTE
-- direto de anon/authenticated nao tem qualquer impacto funcional (continuam
-- a correr normalmente como triggers) e fecha a superficie de ataque.
REVOKE EXECUTE ON FUNCTION public.auto_away_reply() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_referral_credit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_review_credit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_privileged_profile_columns() FROM anon, authenticated;
