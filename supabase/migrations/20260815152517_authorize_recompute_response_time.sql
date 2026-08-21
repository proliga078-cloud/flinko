-- recompute_response_time(p_professional_id) had no authorization check at
-- all: any anon/authenticated caller could force a write to any
-- professional's avg_response_minutes / response_sample_count by passing
-- an arbitrary id. Restrict it to the professional themself (matches the
-- legitimate call site: recomputing your own stats) or an admin.

CREATE OR REPLACE FUNCTION public.recompute_response_time(p_professional_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_avg numeric;
  v_count integer;
begin
  IF auth.uid() IS DISTINCT FROM p_professional_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

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
$function$;
