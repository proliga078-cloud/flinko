-- The AFTER INSERT trigger on messages calls recompute_response_time(),
-- which has a permission check (auth.uid() = professional OR is_admin()).
-- That check is correct for the public RPC (any authenticated user could
-- otherwise call it directly and tamper with another professional's stats),
-- but the trigger fires on EVERY message insert including ones sent BY
-- CLIENTS, whose auth.uid() is never the professional_id -- so every
-- client-initiated message insert was aborted with 'not authorized'.
-- Fix: move the actual computation into an internal, unchecked function
-- used by the trigger, and keep the permission check only on the
-- public-facing RPC wrapper.

create or replace function public.recompute_response_time_internal(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_avg numeric;
  v_count integer;
begin
  with first_client_msg as (
    select c.id as conversation_id,
           c.professional_id,
           min(m.created_at) as client_at
    from conversations c
    join messages m on m.conversation_id = c.id
    where c.professional_id = p_professional_id
      and m.sender_id <> c.professional_id
    group by c.id, c.professional_id
  ),
  first_pro_reply as (
    select f.conversation_id,
           f.client_at,
           min(m.created_at) as pro_at
    from first_client_msg f
    join messages m on m.conversation_id = f.conversation_id
    where m.sender_id = f.professional_id
      and m.created_at > f.client_at
    group by f.conversation_id, f.client_at
  )
  select avg(extract(epoch from (pro_at - client_at)) / 60.0)::numeric,
         count(*)::integer
    into v_avg, v_count
  from first_pro_reply;

  update profiles
     set avg_response_minutes = case when coalesce(v_count,0) > 0 then round(v_avg, 1) else null end,
         response_sample_count = coalesce(v_count, 0)
   where id = p_professional_id;
end;
$$;

revoke all on function public.recompute_response_time_internal(uuid) from public, anon, authenticated;

create or replace function public.recompute_response_time(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  IF auth.uid() IS DISTINCT FROM p_professional_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  perform public.recompute_response_time_internal(p_professional_id);
end;
$$;

create or replace function public.trg_recompute_response_time()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pro uuid;
begin
  select professional_id into v_pro from conversations where id = NEW.conversation_id;
  if v_pro is not null then
    perform public.recompute_response_time_internal(v_pro);
  end if;
  return NEW;
end;
$$;
