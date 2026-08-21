alter table public.profiles
  add column if not exists avg_response_minutes numeric,
  add column if not exists response_sample_count integer not null default 0;

create or replace function public.recompute_response_time(p_professional_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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

create or replace function public.trg_recompute_response_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro uuid;
begin
  select professional_id into v_pro from conversations where id = NEW.conversation_id;
  if v_pro is not null then
    perform public.recompute_response_time(v_pro);
  end if;
  return NEW;
end;
$$;

drop trigger if exists messages_response_time_trigger on public.messages;
create trigger messages_response_time_trigger
  after insert on public.messages
  for each row execute function public.trg_recompute_response_time();
