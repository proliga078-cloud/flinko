
-- ad_slots: só é possível criar/alterar via buy_ad_slot() (SECURITY DEFINER, corre como postgres e
-- por isso ignora RLS). A policy anterior também deixava o próprio profissional inserir/atualizar
-- diretamente a linha (auth.uid()=professional_id), o que permitia contornar buy_ad_slot() e criar
-- anuncios pagos sem gastar creditos (ou prolongar um anuncio existente de graca via UPDATE).
drop policy if exists "ad_slots_insert" on public.ad_slots;
create policy "ad_slots_insert" on public.ad_slots for insert to public with check (is_admin());
comment on policy "ad_slots_insert" on public.ad_slots is 'So admin ou a funcao buy_ad_slot() (SECURITY DEFINER, ignora RLS) podem criar. Antes tambem permitia auth.uid()=professional_id, o que deixava contornar o pagamento em creditos via insert direto pelo cliente. Corrigido 2026-09-12.';

drop policy if exists "ad_slots_update" on public.ad_slots;
create policy "ad_slots_update" on public.ad_slots for update to public using (is_admin());
comment on policy "ad_slots_update" on public.ad_slots is 'So admin pode atualizar diretamente. Antes tambem permitia auth.uid()=professional_id, o que deixava o proprio profissional prolongar/alterar o seu anuncio (ends_at, credits_spent) sem pagar. Corrigido 2026-09-12.';

-- signup_referrals: a policy de insert so validava referred_id=auth.uid(), sem validar referrer_id,
-- o que deixava qualquer conta autenticada inserir uma linha a apontar para QUALQUER referrer_id à escolha,
-- disparando o trigger grant_referral_credit() e dando 10 creditos gratis a esse referrer_id -- sem
-- nunca ter usado um codigo de referral valido. Corrigido: a insercao passa a ser feita só pela nova
-- funcao apply_signup_referral() (SECURITY DEFINER), que valida o codigo antes de inserir; a policy
-- de insert directo pelo cliente é removida.
create or replace function public.apply_signup_referral(code text, new_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_id uuid;
begin
  if code is null or new_user_id is null then return; end if;
  select id into ref_id from profiles where referral_code = code limit 1;
  if ref_id is null or ref_id = new_user_id then return; end if;
  insert into signup_referrals (referrer_id, referred_id) values (ref_id, new_user_id)
  on conflict (referred_id) do nothing;
end;
$$;
grant execute on function public.apply_signup_referral(text, uuid) to anon, authenticated;

drop policy if exists "signup_referrals_insert" on public.signup_referrals;
create policy "signup_referrals_insert" on public.signup_referrals for insert to public with check (is_admin());
comment on policy "signup_referrals_insert" on public.signup_referrals is 'So admin ou apply_signup_referral() (SECURITY DEFINER, valida o codigo) podem inserir. Antes so validava referred_id=auth.uid() sem validar referrer_id, permitindo reclamar credito de referral com um referrer_id arbitrario sem codigo valido. Corrigido 2026-09-12.';
