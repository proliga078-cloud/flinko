
create or replace function public.notify_admins_verification_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_name text;
  doc_count int;
begin
  select name into requester_name from public.profiles where id = new.profile_id;
  doc_count := coalesce(jsonb_array_length(new.documents), 0);

  insert into public.notification_queue (kind, recipient_profile_id, recipient_email, recipient_name, sender_name, preview)
  select
    'verification_request',
    p.id,
    u.email,
    p.name,
    coalesce(requester_name, 'Um profissional'),
    'Pediu verificação de perfil (' || doc_count || ' documento(s) anexado(s)).'
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_admin = true
    and u.email is not null;

  -- dispara de imediato o processamento da fila de notificações (email + push),
  -- em vez de depender do frontend chamar a função (que só o faz para mensagens novas)
  perform net.http_post(
    url := 'https://cdwinidhtfxfxowflize.supabase.co/functions/v1/send-notifications',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );

  return new;
end;
$$;
