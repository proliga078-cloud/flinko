-- BUG: trg_queue_message_notification() referencia profiles.email, coluna
-- removida a 28/07 (migração remover_email_duplicado_de_profiles). Isto faz
-- rebentar TODA a transação de insert em messages -> "Erro ao enviar mensagem"
-- em 100% dos envios.
--
-- Esta trigger + a fila notification_queue + o cron process-notification-queue
-- já tinham sido desligados de propósito a 28/07 (migração
-- desativar_notificacoes_duplicadas) precisamente porque o notify-message.js
-- (Netlify Function) já trata do email+push de forma correta, usando
-- emails_for() para ir buscar o email a auth.users. Em algum momento fora do
-- histórico de migrações, a trigger e o cron foram recriados manualmente
-- (com nomes diferentes) sem essa correção, reintroduzindo o bug.
--
-- Fix: voltar a desligar este caminho duplicado/partido. O envio de
-- mensagens passa a depender só do notify-message.js, que já funciona.
-- Nada é apagado (função e edge function send-notifications ficam no sítio,
-- prontas a reativar/corrigir no futuro se um dia se quiser mover o envio
-- para o servidor).

DROP TRIGGER IF EXISTS trg_queue_message_notification ON public.messages;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-notification-queue') THEN
    PERFORM cron.unschedule('process-notification-queue');
  END IF;
END $$;
