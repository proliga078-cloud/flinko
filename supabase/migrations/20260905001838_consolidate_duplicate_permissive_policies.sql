-- Consolida politicas RLS permissivas duplicadas (aviso multiple_permissive_policies).
-- Regra seguida em cada tabela: para o mesmo comando (SELECT/INSERT/UPDATE/DELETE),
-- varias politicas PERMISSIVE == uma unica politica com as condicoes unidas por OR
-- (e semanticamente identico, o Postgres avalia PERMISSIVE policies com OR).
-- Tambem remove duplicados legados (checks via join a profiles.id/user_id que,
-- para perfis criados normalmente, e sempre igual a auth.uid() direto).
-- Aprovado explicitamente pelo utilizador em 2026-09-05.

-- ===================== services =====================
drop policy if exists owner_delete_services on public.services;
drop policy if exists owner_insert_services on public.services;
drop policy if exists owner_update_services on public.services;
drop policy if exists public_read_services on public.services;
drop policy if exists admin_delete_services on public.services;
drop policy if exists admin_insert_services on public.services;
drop policy if exists admin_update_services on public.services;
drop policy if exists services_delete on public.services;
drop policy if exists services_insert on public.services;
drop policy if exists services_update on public.services;
create policy services_delete on public.services for delete using (is_admin() or (select auth.uid()) = professional_id);
create policy services_insert on public.services for insert with check (is_admin() or (select auth.uid()) = professional_id);
create policy services_update on public.services for update using (is_admin() or (select auth.uid()) = professional_id) with check (is_admin() or (select auth.uid()) = professional_id);

-- ===================== portfolio_items =====================
drop policy if exists owner_delete_portfolio on public.portfolio_items;
drop policy if exists owner_insert_portfolio on public.portfolio_items;
drop policy if exists public_read_portfolio on public.portfolio_items;
drop policy if exists admin_delete_portfolio on public.portfolio_items;
drop policy if exists admin_insert_portfolio on public.portfolio_items;
drop policy if exists portfolio_delete on public.portfolio_items;
drop policy if exists portfolio_insert on public.portfolio_items;
create policy portfolio_delete on public.portfolio_items for delete using (is_admin() or (select auth.uid()) = professional_id);
create policy portfolio_insert on public.portfolio_items for insert with check (is_admin() or (select auth.uid()) = professional_id);

-- ===================== messages_legacy_contact_form =====================
drop policy if exists owner_read_messages on public.messages_legacy_contact_form;
drop policy if exists owner_update_messages on public.messages_legacy_contact_form;
drop policy if exists admin_select_legacy on public.messages_legacy_contact_form;
drop policy if exists admin_update_legacy on public.messages_legacy_contact_form;
drop policy if exists messages_select on public.messages_legacy_contact_form;
drop policy if exists messages_update on public.messages_legacy_contact_form;
create policy messages_select on public.messages_legacy_contact_form for select using (is_admin() or (select auth.uid()) = professional_id);
create policy messages_update on public.messages_legacy_contact_form for update using (is_admin() or (select auth.uid()) = professional_id) with check (is_admin() or (select auth.uid()) = professional_id);

-- ===================== ad_slots =====================
drop policy if exists admin_all_ad_slots on public.ad_slots;
drop policy if exists ad_slots_insert_own on public.ad_slots;
drop policy if exists ad_slots_update_own on public.ad_slots;
create policy ad_slots_insert on public.ad_slots for insert with check (is_admin() or (select auth.uid()) = professional_id);
create policy ad_slots_update on public.ad_slots for update using (is_admin() or (select auth.uid()) = professional_id);
create policy ad_slots_delete on public.ad_slots for delete using (is_admin());

-- ===================== business_expenses =====================
drop policy if exists admin_all_business_expenses on public.business_expenses;
drop policy if exists business_expenses_delete on public.business_expenses;
drop policy if exists business_expenses_insert on public.business_expenses;
drop policy if exists business_expenses_select on public.business_expenses;
drop policy if exists business_expenses_update on public.business_expenses;
create policy business_expenses_select on public.business_expenses for select using (is_admin() or (select auth.uid()) = professional_id);
create policy business_expenses_insert on public.business_expenses for insert with check (is_admin() or (select auth.uid()) = professional_id);
create policy business_expenses_update on public.business_expenses for update using (is_admin() or (select auth.uid()) = professional_id);
create policy business_expenses_delete on public.business_expenses for delete using (is_admin() or (select auth.uid()) = professional_id);

-- ===================== jobs =====================
drop policy if exists admin_select_jobs on public.jobs;
drop policy if exists jobs_select_own on public.jobs;
drop policy if exists admin_update_jobs on public.jobs;
drop policy if exists jobs_update_own on public.jobs;
drop policy if exists admin_delete_jobs on public.jobs;
drop policy if exists jobs_delete_own on public.jobs;
create policy jobs_select on public.jobs for select using (is_admin() or (select auth.uid()) = professional_id or (select auth.uid()) = client_id);
create policy jobs_update on public.jobs for update using (is_admin() or (select auth.uid()) = professional_id) with check (is_admin() or (select auth.uid()) = professional_id);
create policy jobs_delete on public.jobs for delete using (is_admin() or (select auth.uid()) = professional_id);

-- ===================== push_subscriptions =====================
drop policy if exists admin_all_push_subscriptions on public.push_subscriptions;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select using (is_admin() or (select auth.uid()) = profile_id);
create policy push_subscriptions_insert on public.push_subscriptions for insert with check (is_admin() or (select auth.uid()) = profile_id);
create policy push_subscriptions_delete on public.push_subscriptions for delete using (is_admin() or (select auth.uid()) = profile_id);
create policy push_subscriptions_admin_update on public.push_subscriptions for update using (is_admin());

-- ===================== gdpr_requests =====================
drop policy if exists gdpr_admin_select on public.gdpr_requests;
drop policy if exists gdpr_select_own on public.gdpr_requests;
drop policy if exists gdpr_admin_update on public.gdpr_requests;
drop policy if exists gdpr_user_cancel_own on public.gdpr_requests;
create policy gdpr_select on public.gdpr_requests for select using (is_admin() or (select auth.uid()) = profile_id);
create policy gdpr_update on public.gdpr_requests for update
  using (is_admin() or ((select auth.uid()) = profile_id and status = 'pending'))
  with check (is_admin() or ((select auth.uid()) = profile_id and status = 'cancelled'));

-- ===================== profile_views =====================
drop policy if exists admin_select_profile_views on public.profile_views;
drop policy if exists profile_views_select_own on public.profile_views;
create policy profile_views_select on public.profile_views for select using (is_admin() or (select auth.uid()) = profile_id);

-- ===================== profiles =====================
drop policy if exists owner_insert_profiles on public.profiles;
drop policy if exists admin_update_profiles on public.profiles;
drop policy if exists owner_update_profiles on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (is_admin() or (select auth.uid()) = id) with check (is_admin() or (select auth.uid()) = id);

-- ===================== requests =====================
drop policy if exists admin_delete_requests on public.requests;
drop policy if exists requests_delete on public.requests;
drop policy if exists admin_update_requests on public.requests;
drop policy if exists requests_update on public.requests;
create policy requests_delete on public.requests for delete using (is_admin() or (select auth.uid()) = client_id);
create policy requests_update on public.requests for update using (is_admin() or (select auth.uid()) = client_id) with check (is_admin() or (select auth.uid()) = client_id);

-- ===================== reviews =====================
drop policy if exists admin_delete_reviews on public.reviews;
drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete on public.reviews for delete using (is_admin() or (select auth.uid()) = client_id);

-- ===================== signup_referrals =====================
drop policy if exists admin_all_signup_referrals on public.signup_referrals;
drop policy if exists signup_referrals_insert on public.signup_referrals;
drop policy if exists signup_referrals_select_referred on public.signup_referrals;
drop policy if exists signup_referrals_select_referrer on public.signup_referrals;
create policy signup_referrals_select on public.signup_referrals for select using (is_admin() or (select auth.uid()) = referred_id or (select auth.uid()) = referrer_id);
create policy signup_referrals_insert on public.signup_referrals for insert with check (is_admin() or (select auth.uid()) = referred_id);
create policy signup_referrals_update on public.signup_referrals for update using (is_admin());
create policy signup_referrals_delete on public.signup_referrals for delete using (is_admin());

-- ===================== conversations =====================
drop policy if exists admin_select_conversations on public.conversations;
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select using (is_admin() or (select auth.uid()) = professional_id or (select auth.uid()) = client_id);

-- ===================== messages =====================
drop policy if exists admin_select_messages on public.messages;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  is_admin() or exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.professional_id = (select auth.uid()) or c.client_id = (select auth.uid()))
  )
);
