-- A coluna "finances" controlava, no código do dashboard, dois separadores
-- sem relação direta entre si: "Finanças" (gestão de despesas/orçamentos) e
-- "Mercado" (preços de mercado/concorrência). Hoje têm sempre o mesmo valor
-- por plano (ambos true em pro/premium, false em free), mas são
-- funcionalidades distintas e podiam divergir no futuro (ex: dar "Mercado"
-- a todos os planos como incentivo, sem dar "Finanças"). Esta coluna nova
-- separa os dois flags mantendo exatamente o comportamento atual.
alter table plan_limits add column if not exists market_insights boolean not null default false;
update plan_limits set market_insights = finances;
comment on column plan_limits.market_insights is 'Controla o acesso ao separador "Mercado" (preços/concorrência) no dashboard. Antes partilhava a coluna "finances" com o separador "Finanças" — separado em 2026-09 para não confundir duas funcionalidades sem relação direta.';
