drop policy if exists "allow insert visits" on public.site_visits;
create policy "allow insert visits" on public.site_visits
  for insert
  to public
  with check (true);
