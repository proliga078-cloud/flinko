-- BUG GRAVE encontrado ao testar o site a serio depois da ronda anterior:
-- get_my_profile(), definida como "language sql returns profiles" a fazer
-- "select * from profiles where id = auth.uid()", quando NAO existe
-- nenhuma linha para o utilizador, nao devolve NULL verdadeiro — devolve
-- uma "linha" com TODAS as colunas a null (um comportamento conhecido do
-- Postgres para funcoes escalares que devolvem um tipo composto a partir
-- de uma subquery vazia). Em JavaScript esse objeto e "truthy" (nao e
-- null), por isso o dashboard.html achava sempre que o perfil já existia
-- e NUNCA chamava createProfile() para criar a linha na base de dados —
-- qualquer conta nova ficava sem perfil nenhum, mascarado porque o resto
-- do dashboard usa valores por omissão (?? '' / || 'free') que fazem
-- parecer tudo normal. Corrigido para devolver NULL a serio quando nao ha
-- perfil, usando plpgsql com "if not found".
create or replace function public.get_my_profile()
returns profiles
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  result profiles;
begin
  select * into result from public.profiles where id = auth.uid();
  if not found then
    return null;
  end if;
  return result;
end;
$$;
