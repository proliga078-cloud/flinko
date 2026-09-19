-- O plano Starter e vendido (create-checkout-session.js) mas nunca teve linha
-- em plan_limits. Sem ela, o dashboard caia nos limites do plano gratis
-- (3 fotos, 3 orcamentos/mes) e os joins a plan_limits deixavam o
-- profissional de fora. Os valores seguem o que o pricing.html promete:
-- servicos, mensagens, orcamentos e portfolio ilimitados, agenda incluida;
-- SEM marca propria, financas, avanco nos pedidos, destaque nem link proprio.
insert into public.plan_limits
  (plan, portfolio_max, quotes_per_month, finances, own_branding, custom_link,
   request_head_start_minutes, listing_boost, ai_actions)
values
  ('starter', 9999, null, false, false, false, 0, false, false)
on conflict (plan) do nothing;
