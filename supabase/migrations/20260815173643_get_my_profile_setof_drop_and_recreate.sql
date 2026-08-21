drop function public.get_my_profile();

create function public.get_my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = 'public'
as $$
  select * from public.profiles where id = auth.uid()
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
