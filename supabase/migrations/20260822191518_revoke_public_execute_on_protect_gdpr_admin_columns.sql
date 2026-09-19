-- protect_gdpr_admin_columns() e uma funcao de trigger (so faz sentido
-- correr dentro do contexto de um INSERT/UPDATE em gdpr_requests, onde
-- NEW/OLD/TG_OP existem) -- nao deve ser chamavel diretamente via
-- /rest/v1/rpc/protect_gdpr_admin_columns. As outras funcoes de trigger
-- equivalentes (protect_privileged_profile_columns, protect_message_fields)
-- ja tinham o EXECUTE de PUBLIC/anon/authenticated revogado -- esta
-- migracao alinha a funcao nova com o mesmo padrao (falhou por omissao
-- na migracao anterior, apanhado pelo Supabase security advisor logo a
-- seguir a aplicar).
revoke execute on function public.protect_gdpr_admin_columns() from public, anon, authenticated;
