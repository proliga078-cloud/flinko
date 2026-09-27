-- Limite diário de utilização dos assistentes de IA (edge functions
-- ai-assistant e ai-profile-builder).
--
-- Exigiam sessão, mas não tinham limite: uma conta podia chamá-los em ciclo e
-- gastar créditos da Anthropic sem fim. Cada chamada passa agora por
-- ai_consume(), que conta as utilizações por conta, função e dia e diz se ainda
-- há quota. A contagem vive na base de dados, por isso vale entre instâncias
-- da função (ao contrário de um contador em memória).

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  fn text not null,
  day date not null default current_date,
  count integer not null default 0,
  primary key (user_id, fn, day)
);

-- Sem políticas: ninguém lê nem escreve diretamente pela API. Só a função
-- abaixo (security definer) mexe na tabela.
alter table public.ai_usage enable row level security;

-- Conta mais uma utilização de quem chama e devolve true se ainda estiver
-- dentro do limite do dia. p_limit é escolhido pela edge function; chamar isto
-- diretamente só gasta a quota do próprio, não dá mais nenhuma.
create or replace function public.ai_consume(p_fn text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    return false;
  end if;
  if p_fn not in ('ai-assistant', 'ai-profile-builder') then
    return false;
  end if;
  insert into public.ai_usage (user_id, fn, day, count)
  values (auth.uid(), p_fn, current_date, 1)
  on conflict (user_id, fn, day) do update set count = public.ai_usage.count + 1
  returning count into n;
  return n <= least(greatest(coalesce(p_limit, 1), 1), 500);
end;
$$;

revoke all on function public.ai_consume(text, integer) from public, anon;
grant execute on function public.ai_consume(text, integer) to authenticated;
