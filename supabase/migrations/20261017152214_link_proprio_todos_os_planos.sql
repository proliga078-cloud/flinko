-- Out/2026: o link com o nome (flinko.pt/o-teu-nome) passa a ser de todos os
-- planos, para cada profissional divulgar o perfil com um endereço fácil e o
-- QR. O trigger check_slug_allowed continua a ler plan_limits.custom_link,
-- por isso chega ligar a coluna nos planos que ainda não a tinham.
update public.plan_limits set custom_link = true where plan in ('free', 'starter');
