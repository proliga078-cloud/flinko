-- 1) Fecha o vetor de spam: tabela legacy deprecated tinha 2 políticas de INSERT
--    permissivas (WITH CHECK true), sem nenhuma página a inserir lá. Ninguém
--    precisa de escrever nesta tabela; leitura/atualização continuam intactas.
DROP POLICY IF EXISTS "messages_insert" ON public.messages_legacy_contact_form;
DROP POLICY IF EXISTS "public_insert_messages" ON public.messages_legacy_contact_form;

-- 2) process_notification_queue() lê um segredo interno e dispara um POST
--    para a função de notificações. Estava chamável por qualquer pessoa via
--    RPC público (anon/authenticated). Não há pg_cron job a chamá-la a partir
--    do Postgres, por isso o disparo real deve vir de fora com uma role
--    privilegiada (service_role/postgres), que não depende destes grants.
REVOKE EXECUTE ON FUNCTION public.process_notification_queue() FROM PUBLIC, anon, authenticated;

-- 3) Funções-gatilho (RETURNS trigger) nunca deviam ser chamáveis via RPC
--    direto — o Postgres já as bloqueia fora do contexto de trigger, mas
--    reduz a superfície exposta na API pública.
REVOKE EXECUTE ON FUNCTION public.auto_confirm_email() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_slug_allowed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_plan_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_queue_message_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recompute_response_time() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_service_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_portfolio_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_conversation_last_message() FROM PUBLIC, anon, authenticated;

-- 4) search_path fixo nas funções SECURITY DEFINER assinaladas pelo advisor
--    do Supabase — impede um search_path malicioso de desviar chamadas a
--    objetos com o mesmo nome noutro schema.
ALTER FUNCTION public.auto_confirm_email() SET search_path = public;
ALTER FUNCTION public.protect_plan_columns() SET search_path = public;
ALTER FUNCTION public.update_conversation_last_message() SET search_path = public;
ALTER FUNCTION public.enforce_service_limit() SET search_path = public;
ALTER FUNCTION public.enforce_portfolio_limit() SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
