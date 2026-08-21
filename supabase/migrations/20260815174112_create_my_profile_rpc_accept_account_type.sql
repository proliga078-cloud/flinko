-- auth.html tem o mesmo problema no registo (insertProfile() fazia o
-- mesmo upsert direto, incluindo account_type conforme a escolha
-- "Contratar" vs "Oferecer serviços"). Alargar a funcao para aceitar
-- account_type em vez de criar uma segunda funcao.
create or replace function public.create_my_profile_if_missing(p_name text, p_account_type text default 'professional')
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  insert into public.profiles (id, user_id, name, plan, approved, location, category, bio, account_type)
  values (auth.uid(), auth.uid(), p_name, 'free', true, '', '', '', coalesce(p_account_type,'professional'))
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.create_my_profile_if_missing(text, text) from public, anon;
grant execute on function public.create_my_profile_if_missing(text, text) to authenticated;

-- a assinatura antiga (so p_name) fica orfa depois do CREATE OR REPLACE
-- com parametros novos criar uma sobrecarga; remover para nao haver
-- ambiguidade de chamada.
drop function if exists public.create_my_profile_if_missing(text);
