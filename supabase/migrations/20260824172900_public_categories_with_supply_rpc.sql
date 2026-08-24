-- BUG AO VIVO: markEmptyCategories() (index.html) devia esconder as
-- categorias sem profissionais reais, mas falha silenciosamente para
-- utilizadores com sessão iniciada (role "authenticated"). Causa: a
-- migration 20260815171632 revogou SELECT em account_type de authenticated
-- (para impedir ler o account_type de OUTROS perfis), mas essa mesma coluna
-- é usada no filtro desta query pública. Resultado: "permission denied for
-- table profiles", apanhado pelo catch silencioso, e as 16 categorias
-- ficam todas visíveis para qualquer visitante com sessão (confirmado ao
-- vivo em proliga.pt com uma conta autenticada).
--
-- Em vez de voltar a abrir account_type para authenticated (reintroduzia o
-- problema que aquela migration corrigia), criamos uma função dedicada —
-- o mesmo padrão já usado em spotlight_pros()/resolve_referral_code(): só
-- devolve o agregado necessário (quais categorias têm oferta real), nunca
-- as colunas privadas por trás.

create or replace function public.categories_with_supply()
returns setof text
language sql
stable
security definer
set search_path = 'public'
as $$
  select distinct category
  from public.profiles
  where is_demo = false
    and account_type = 'professional'
    and category is not null
    and category <> ''
$$;

revoke all on function public.categories_with_supply() from public;
grant execute on function public.categories_with_supply() to anon, authenticated;
