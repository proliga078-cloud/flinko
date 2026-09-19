-- Corrige auth_rls_initplan: envolver auth.uid() em (select ...) para
-- ser avaliado uma vez por query em vez de uma vez por linha.

alter policy conversations_update on public.conversations
  using ((select auth.uid()) = professional_id or (select auth.uid()) = client_id)
  with check ((select auth.uid()) = professional_id or (select auth.uid()) = client_id);

alter policy "allow insert visits" on public.site_visits
  with check (user_id is null or user_id = (select auth.uid()));
