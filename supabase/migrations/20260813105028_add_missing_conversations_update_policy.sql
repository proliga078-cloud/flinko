-- BUG: conversations tem RLS ativo mas nunca teve política de UPDATE.
-- A trigger update_conversation_last_message() (que mantém last_message /
-- last_message_at sincronizados a cada mensagem nova) corre como o próprio
-- utilizador (não é SECURITY DEFINER) e por isso fica sempre a "atualizar 0
-- linhas" em silêncio: a lista de conversas nunca mostra a última mensagem
-- nem reordena por mais recente.
--
-- Fix: permitir que cada participante (profissional ou cliente) da conversa
-- a atualize.
CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE
  USING (auth.uid() = professional_id OR auth.uid() = client_id)
  WITH CHECK (auth.uid() = professional_id OR auth.uid() = client_id);
