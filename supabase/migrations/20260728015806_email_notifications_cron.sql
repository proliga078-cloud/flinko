create extension if not exists pg_cron;

-- guardar o segredo partilhado no Vault (gerado agora)
do $$
declare v_secret text := replace(gen_random_uuid()::text,'-','');
begin
  if not exists (select 1 from vault.secrets where name = 'proliga_hook_secret') then
    perform vault.create_secret(v_secret, 'proliga_hook_secret', 'Segredo partilhado para invocar a edge function de notificacoes');
  end if;
end $$;

create or replace function public.process_notification_queue()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_pending integer;
begin
  select count(*) into v_pending from notification_queue where status='pending' and attempts < 3;
  if v_pending = 0 then return; end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'proliga_hook_secret' limit 1;

  perform net.http_post(
    url := 'https://cdwinidhtfxfxowflize.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-proliga-secret', coalesce(v_secret,'')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$$;

select cron.schedule(
  'proliga-notificacoes',
  '* * * * *',
  $$select public.process_notification_queue();$$
);
