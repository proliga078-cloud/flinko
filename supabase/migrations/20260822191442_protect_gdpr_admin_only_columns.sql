-- Auditoria total (ago/2026): a tabela gdpr_requests concede
-- GRANT UPDATE (status, notes, admin_notes, resolved_at) e GRANT INSERT
-- (linha completa) ao role "authenticated" partilhado por todos os
-- utilizadores (nao ha um role Postgres separado para admins -- is_admin()
-- e um flag por linha em profiles, verificado ao nivel de RLS). As
-- politicas RLS gdpr_user_cancel_own/gdpr_insert_own so restringem
-- profile_id e a transicao de status (pending->cancelled) -- nao restringem
-- QUAIS colunas podem ser escritas nesse mesmo INSERT/UPDATE. Resultado:
-- um utilizador a cancelar o proprio pedido de RGPD podia, na mesma
-- chamada, escrever texto arbitrario em admin_notes (que deveria ser
-- exclusivo da equipa) ou um resolved_at falso -- e podia mesmo criar um
-- pedido novo ja com status='completed'/admin_notes preenchidos via INSERT.
--
-- Verificado no codigo (assets/dashboard-growth.js) que o unico caminho
-- legitimo do lado do utilizador e insert({profile_id,request_type}) e
-- update({status:'cancelled'}) -- nunca toca em admin_notes/resolved_at/
-- created_at. O admin (admin.html, updateGdprStatus) escreve
-- status+resolved_at, sempre atras da politica gdpr_admin_update
-- (is_admin()).
--
-- Correcao, no mesmo padrao ja usado em profiles
-- (protect_privileged_profile_columns): um trigger que congela as colunas
-- exclusivas de admin a menos que quem escreve seja is_admin() ou
-- service_role. "status"/"notes" continuam livres para o dono da linha --
-- ja estao corretamente limitados pelas politicas RLS existentes.

create or replace function public.protect_gdpr_admin_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() = 'service_role' or current_user = 'service_role' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- 'pending' ja e o default da coluna -- isto so impede que um INSERT
    -- explicito o contorne enviando outro valor.
    new.status := 'pending';
    new.admin_notes := null;
    new.resolved_at := null;
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    new.admin_notes := old.admin_notes;
    new.resolved_at := old.resolved_at;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$function$;

drop trigger if exists protect_gdpr_admin_columns_trg on public.gdpr_requests;
create trigger protect_gdpr_admin_columns_trg
before insert or update on public.gdpr_requests
for each row execute function public.protect_gdpr_admin_columns();
