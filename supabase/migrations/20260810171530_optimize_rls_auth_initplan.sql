-- ad_slots
drop policy if exists "ad_slots_insert_own" on public.ad_slots;
create policy "ad_slots_insert_own" on public.ad_slots for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "ad_slots_update_own" on public.ad_slots;
create policy "ad_slots_update_own" on public.ad_slots for update to public using ((select auth.uid()) = professional_id);

-- business_expenses
drop policy if exists "business_expenses_delete" on public.business_expenses;
create policy "business_expenses_delete" on public.business_expenses for delete to public using ((select auth.uid()) = professional_id);

drop policy if exists "business_expenses_insert" on public.business_expenses;
create policy "business_expenses_insert" on public.business_expenses for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "business_expenses_select" on public.business_expenses;
create policy "business_expenses_select" on public.business_expenses for select to public using ((select auth.uid()) = professional_id);

drop policy if exists "business_expenses_update" on public.business_expenses;
create policy "business_expenses_update" on public.business_expenses for update to public using ((select auth.uid()) = professional_id);

-- conversations
drop policy if exists "conversations_insert" on public.conversations;
create policy "conversations_insert" on public.conversations for insert to public with check (((select auth.uid()) = client_id) OR ((select auth.uid()) = professional_id));

drop policy if exists "conversations_select" on public.conversations;
create policy "conversations_select" on public.conversations for select to public using (((select auth.uid()) = professional_id) OR ((select auth.uid()) = client_id));

-- jobs
drop policy if exists "jobs_delete_own" on public.jobs;
create policy "jobs_delete_own" on public.jobs for delete to public using ((select auth.uid()) = professional_id);

drop policy if exists "jobs_insert_own" on public.jobs;
create policy "jobs_insert_own" on public.jobs for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own" on public.jobs for select to public using (((select auth.uid()) = professional_id) OR ((select auth.uid()) = client_id));

drop policy if exists "jobs_update_own" on public.jobs;
create policy "jobs_update_own" on public.jobs for update to public using ((select auth.uid()) = professional_id) with check ((select auth.uid()) = professional_id);

-- messages
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert to public with check (
  (sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = messages.conversation_id) AND ((c.professional_id = (select auth.uid())) OR (c.client_id = (select auth.uid()))))))
);

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select to public using (
  EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = messages.conversation_id) AND ((c.professional_id = (select auth.uid())) OR (c.client_id = (select auth.uid())))))
);

drop policy if exists "messages_update" on public.messages;
create policy "messages_update" on public.messages for update to public using (
  EXISTS ( SELECT 1 FROM conversations c WHERE ((c.id = messages.conversation_id) AND ((c.professional_id = (select auth.uid())) OR (c.client_id = (select auth.uid())))))
);

-- messages_legacy_contact_form
drop policy if exists "messages_select" on public.messages_legacy_contact_form;
create policy "messages_select" on public.messages_legacy_contact_form for select to public using ((select auth.uid()) = professional_id);

drop policy if exists "messages_update" on public.messages_legacy_contact_form;
create policy "messages_update" on public.messages_legacy_contact_form for update to public using ((select auth.uid()) = professional_id);

drop policy if exists "owner_read_messages" on public.messages_legacy_contact_form;
create policy "owner_read_messages" on public.messages_legacy_contact_form for select to public using (
  ((select auth.uid()) IS NOT NULL) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = messages_legacy_contact_form.professional_id) AND (profiles.user_id = (select auth.uid())))))
);

drop policy if exists "owner_update_messages" on public.messages_legacy_contact_form;
create policy "owner_update_messages" on public.messages_legacy_contact_form for update to public using (
  EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = messages_legacy_contact_form.professional_id) AND (profiles.user_id = (select auth.uid()))))
);

-- portfolio_items
drop policy if exists "portfolio_insert" on public.portfolio_items;
create policy "portfolio_insert" on public.portfolio_items for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "portfolio_delete" on public.portfolio_items;
create policy "portfolio_delete" on public.portfolio_items for delete to public using ((select auth.uid()) = professional_id);

drop policy if exists "owner_insert_portfolio" on public.portfolio_items;
create policy "owner_insert_portfolio" on public.portfolio_items for insert to public with check (
  ((select auth.uid()) IS NOT NULL) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = portfolio_items.professional_id) AND (profiles.user_id = (select auth.uid())))))
);

drop policy if exists "owner_delete_portfolio" on public.portfolio_items;
create policy "owner_delete_portfolio" on public.portfolio_items for delete to public using (
  EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = portfolio_items.professional_id) AND (profiles.user_id = (select auth.uid()))))
);

-- professional_faqs
drop policy if exists "faqs_update" on public.professional_faqs;
create policy "faqs_update" on public.professional_faqs for update to public using ((select auth.uid()) = professional_id);

drop policy if exists "faqs_delete" on public.professional_faqs;
create policy "faqs_delete" on public.professional_faqs for delete to public using ((select auth.uid()) = professional_id);

drop policy if exists "faqs_insert" on public.professional_faqs;
create policy "faqs_insert" on public.professional_faqs for insert to public with check ((select auth.uid()) = professional_id);

-- professional_updates
drop policy if exists "updates_insert" on public.professional_updates;
create policy "updates_insert" on public.professional_updates for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "updates_update" on public.professional_updates;
create policy "updates_update" on public.professional_updates for update to public using ((select auth.uid()) = professional_id);

drop policy if exists "updates_delete" on public.professional_updates;
create policy "updates_delete" on public.professional_updates for delete to public using ((select auth.uid()) = professional_id);

-- profile_private
drop policy if exists "profile_private_insert_own" on public.profile_private;
create policy "profile_private_insert_own" on public.profile_private for insert to public with check ((select auth.uid()) = profile_id);

drop policy if exists "profile_private_select_own_or_admin" on public.profile_private;
create policy "profile_private_select_own_or_admin" on public.profile_private for select to public using (
  ((select auth.uid()) = profile_id) OR (EXISTS ( SELECT 1 FROM profiles ap WHERE ((ap.id = (select auth.uid())) AND (ap.is_admin = true))))
);

drop policy if exists "profile_private_update_own_or_admin" on public.profile_private;
create policy "profile_private_update_own_or_admin" on public.profile_private for update to public using (
  ((select auth.uid()) = profile_id) OR (EXISTS ( SELECT 1 FROM profiles ap WHERE ((ap.id = (select auth.uid())) AND (ap.is_admin = true))))
);

-- profile_views
drop policy if exists "profile_views_select_own" on public.profile_views;
create policy "profile_views_select_own" on public.profile_views for select to public using ((select auth.uid()) = profile_id);

-- profiles
drop policy if exists "owner_insert_profiles" on public.profiles;
create policy "owner_insert_profiles" on public.profiles for insert to public with check ((select auth.uid()) = user_id);

drop policy if exists "owner_update_profiles" on public.profiles;
create policy "owner_update_profiles" on public.profiles for update to public using ((select auth.uid()) = user_id);

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert to public with check ((select auth.uid()) = id);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update to public using ((select auth.uid()) = id);

-- push_subscriptions
drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions for delete to public using ((select auth.uid()) = profile_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions for insert to public with check ((select auth.uid()) = profile_id);

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions for select to public using ((select auth.uid()) = profile_id);

-- quotes
drop policy if exists "quotes_delete_own" on public.quotes;
create policy "quotes_delete_own" on public.quotes for delete to public using ((select auth.uid()) = professional_id);

drop policy if exists "quotes_insert_own" on public.quotes;
create policy "quotes_insert_own" on public.quotes for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "quotes_select_own" on public.quotes;
create policy "quotes_select_own" on public.quotes for select to public using ((select auth.uid()) = professional_id);

drop policy if exists "quotes_update_own" on public.quotes;
create policy "quotes_update_own" on public.quotes for update to public using ((select auth.uid()) = professional_id);

-- referrals
drop policy if exists "referrals_delete_own" on public.referrals;
create policy "referrals_delete_own" on public.referrals for delete to public using ((select auth.uid()) = referrer_id);

drop policy if exists "referrals_insert_own" on public.referrals;
create policy "referrals_insert_own" on public.referrals for insert to public with check ((select auth.uid()) = referrer_id);

drop policy if exists "referrals_select_involved" on public.referrals;
create policy "referrals_select_involved" on public.referrals for select to public using (((select auth.uid()) = referrer_id) OR ((select auth.uid()) = referred_id));

-- request_offers
drop policy if exists "request_offers_delete" on public.request_offers;
create policy "request_offers_delete" on public.request_offers for delete to public using (((select auth.uid()) = professional_id) OR is_admin());

drop policy if exists "request_offers_insert" on public.request_offers;
create policy "request_offers_insert" on public.request_offers for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "request_offers_select" on public.request_offers;
create policy "request_offers_select" on public.request_offers for select to public using (
  ((select auth.uid()) = professional_id) OR ((select auth.uid()) = ( SELECT requests.client_id FROM requests WHERE (requests.id = request_offers.request_id))) OR is_admin()
);

drop policy if exists "request_offers_update" on public.request_offers;
create policy "request_offers_update" on public.request_offers for update to public using ((select auth.uid()) = professional_id);

-- requests
drop policy if exists "requests_insert" on public.requests;
create policy "requests_insert" on public.requests for insert to public with check ((select auth.uid()) = client_id);

drop policy if exists "requests_update" on public.requests;
create policy "requests_update" on public.requests for update to public using ((select auth.uid()) = client_id);

drop policy if exists "requests_delete" on public.requests;
create policy "requests_delete" on public.requests for delete to public using ((select auth.uid()) = client_id);

drop policy if exists "requests_select" on public.requests;
create policy "requests_select" on public.requests for select to public using (
  ((select auth.uid()) = client_id) OR is_admin() OR (created_at <= (now() - make_interval(mins => my_request_delay_minutes())))
);

-- reviews
drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert" on public.reviews for insert to public with check (
  ((select auth.uid()) IS NOT NULL) AND ((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1 FROM conversations c WHERE (((c.client_id = (select auth.uid())) AND (c.professional_id = reviews.professional_id)) OR ((c.professional_id = (select auth.uid())) AND (c.client_id = reviews.professional_id)))))
);

drop policy if exists "reviews_delete_own" on public.reviews;
create policy "reviews_delete_own" on public.reviews for delete to public using ((select auth.uid()) = client_id);

-- services
drop policy if exists "services_insert" on public.services;
create policy "services_insert" on public.services for insert to public with check ((select auth.uid()) = professional_id);

drop policy if exists "services_update" on public.services;
create policy "services_update" on public.services for update to public using ((select auth.uid()) = professional_id);

drop policy if exists "services_delete" on public.services;
create policy "services_delete" on public.services for delete to public using ((select auth.uid()) = professional_id);

drop policy if exists "owner_insert_services" on public.services;
create policy "owner_insert_services" on public.services for insert to public with check (
  ((select auth.uid()) IS NOT NULL) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = services.professional_id) AND (profiles.user_id = (select auth.uid())))))
);

drop policy if exists "owner_update_services" on public.services;
create policy "owner_update_services" on public.services for update to public using (
  EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = services.professional_id) AND (profiles.user_id = (select auth.uid()))))
);

drop policy if exists "owner_delete_services" on public.services;
create policy "owner_delete_services" on public.services for delete to public using (
  EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = services.professional_id) AND (profiles.user_id = (select auth.uid()))))
);

-- signup_referrals
drop policy if exists "signup_referrals_select_referrer" on public.signup_referrals;
create policy "signup_referrals_select_referrer" on public.signup_referrals for select to public using ((select auth.uid()) = referrer_id);

drop policy if exists "signup_referrals_select_referred" on public.signup_referrals;
create policy "signup_referrals_select_referred" on public.signup_referrals for select to public using ((select auth.uid()) = referred_id);

drop policy if exists "signup_referrals_insert" on public.signup_referrals;
create policy "signup_referrals_insert" on public.signup_referrals for insert to public with check ((select auth.uid()) = referred_id);

-- site_visits
drop policy if exists "admin can read visits" on public.site_visits;
create policy "admin can read visits" on public.site_visits for select to authenticated using (
  EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))
);
