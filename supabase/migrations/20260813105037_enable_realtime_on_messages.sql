-- BUG: messages.html subscreve postgres_changes (INSERT) na tabela messages
-- para a conversa parecer "ao vivo" (mensagem do outro lado aparece sem dar
-- reload). Só que a tabela messages nunca foi adicionada à publicação
-- supabase_realtime (só "jobs" lá estava), por isso essa subscrição nunca
-- recebia nada.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
