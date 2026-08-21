create or replace function public.auto_away_reply()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_until date;
  v_msg text;
  v_content text;
begin
  select unavailable_until, unavailable_message into v_until, v_msg
    from profiles where id = new.professional_id;
  if v_until is not null and v_until >= current_date then
    v_content := coalesce(v_msg, 'Estou indisponível de momento. Respondo assim que possível.');
    insert into messages(conversation_id, sender_id, content)
      values (new.id, new.professional_id, v_content);
    update conversations set last_message = v_content, last_message_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_away_reply on public.conversations;
create trigger trg_auto_away_reply
  after insert on public.conversations
  for each row execute function public.auto_away_reply();
