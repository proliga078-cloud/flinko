-- Mais um efeito em cascata da restricao de colunas: o upsert direto do
-- dashboard.html para criar o perfil na primeira vez ("insert ... on
-- conflict (user_id) do update") deixou de funcionar para contas novas —
-- o "on conflict ... do update" do Postgres precisa de privilegio de
-- SELECT sobre as colunas envolvidas (para conseguir comparar/ler a linha
-- em conflito), incluindo user_id, que ja nao e uma coluna publica.
-- Confirmado ao vivo: uma conta nova a tentar criar o perfil pela primeira
-- vez recebia "permission denied for table profiles", mesmo sem pedir
-- nenhum dado de volta. Em vez de andar a afinar grants para o upsert
-- funcionar (frágil), criar o perfil passa a ser feito dentro de uma
-- funcao SECURITY DEFINER — corre com privilegios completos,
-- independentemente das colunas que o role authenticated pode ler.
create or replace function public.create_my_profile_if_missing(p_name text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;
  insert into public.profiles (id, user_id, name, plan, approved, location, category, bio)
  values (auth.uid(), auth.uid(), p_name, 'free', true, '', '', '')
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.create_my_profile_if_missing(text) from public, anon;
grant execute on function public.create_my_profile_if_missing(text) to authenticated;
