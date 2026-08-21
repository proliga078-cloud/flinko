-- Ja existe um sistema de notificacoes via Netlify Functions (notify-message.js).
-- Desativar o trigger e o agendador criados hoje para evitar emails duplicados.
-- A infraestrutura fica no sitio, pronta a reativar se algum dia se quiser mover para o servidor.

drop trigger if exists messages_notify_trigger on public.messages;

do $$
begin
  if exists (select 1 from cron.job where jobname='proliga-notificacoes') then
    perform cron.unschedule('proliga-notificacoes');
  end if;
end $$;

delete from public.notification_queue;
