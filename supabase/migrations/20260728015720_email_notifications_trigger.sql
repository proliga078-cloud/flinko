create or replace function public.trg_queue_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv record;
  v_recipient uuid;
  v_email text;
  v_rname text;
  v_sname text;
  v_notify boolean;
  v_recent integer;
begin
  select professional_id, client_id into v_conv
  from conversations where id = NEW.conversation_id;
  if v_conv is null then return NEW; end if;

  -- destinatario e a outra parte da conversa
  if NEW.sender_id = v_conv.professional_id then
    v_recipient := v_conv.client_id;
  else
    v_recipient := v_conv.professional_id;
  end if;
  if v_recipient is null or v_recipient = NEW.sender_id then return NEW; end if;

  select email, name, coalesce(notify_email,true)
    into v_email, v_rname, v_notify
  from profiles where id = v_recipient;

  if v_email is null or v_email = '' or v_notify is not true then
    return NEW;
  end if;

  -- anti-spam: no maximo 1 email por conversa/destinatario a cada 15 minutos
  select count(*) into v_recent
  from notification_queue
  where recipient_profile_id = v_recipient
    and conversation_id = NEW.conversation_id
    and created_at > now() - interval '15 minutes';
  if v_recent > 0 then return NEW; end if;

  select name into v_sname from profiles where id = NEW.sender_id;

  insert into notification_queue
    (kind, recipient_profile_id, recipient_email, recipient_name, sender_name, preview, conversation_id)
  values
    ('new_message', v_recipient, v_email, v_rname, coalesce(v_sname,'Um cliente'),
     left(coalesce(NEW.content,''), 140), NEW.conversation_id);

  return NEW;
end;
$$;

drop trigger if exists messages_notify_trigger on public.messages;
create trigger messages_notify_trigger
  after insert on public.messages
  for each row execute function public.trg_queue_message_notification();
