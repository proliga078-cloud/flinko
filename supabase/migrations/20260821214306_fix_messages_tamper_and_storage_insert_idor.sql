-- 1) Impede alterar content/sender_id/conversation_id/created_at de mensagens
--    ja enviadas. So a coluna "read" (e outras nao protegidas) podem mudar
--    por quem pertence a conversa; service_role continua livre (webhooks/functions).
CREATE OR REPLACE FUNCTION public.protect_message_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    NEW.sender_id := OLD.sender_id;
    NEW.content := OLD.content;
    NEW.conversation_id := OLD.conversation_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_message_fields_trg ON public.messages;
CREATE TRIGGER protect_message_fields_trg
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.protect_message_fields();

-- 2) Storage: INSERT tem de exigir a mesma posse de pasta que UPDATE/DELETE ja exigem.
--    Todos os caminhos usados pelo frontend sao "<categoria>/<auth.uid()>/ficheiro",
--    por isso a regra e igual para profiles/portfolio/diary/requests/ads.
DROP POLICY IF EXISTS "proliga_media_insert" ON storage.objects;
CREATE POLICY "proliga_media_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'proliga-media'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- Corrige tambem UPDATE/DELETE: antes so cobriam "profiles" e "portfolio",
-- deixando diary/requests/ads sem UPDATE/DELETE nem para o proprio dono.
DROP POLICY IF EXISTS "proliga_media_update" ON storage.objects;
CREATE POLICY "proliga_media_update" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'proliga-media'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

DROP POLICY IF EXISTS "proliga_media_delete" ON storage.objects;
CREATE POLICY "proliga_media_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'proliga-media'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );

-- 3) Buckets legados "avatars" e "portfolio": ja nao sao usados por nenhuma
--    pagina (tudo migrou para proliga-media), mas continuam acessiveis via
--    API com a mesma chave publica do site. Fecha o buraco de INSERT tambem
--    aqui, por defesa em profundidade, seguindo a mesma regra do UPDATE.
DROP POLICY IF EXISTS "avatars_insert" ON storage.objects;
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "portfolio_storage_insert" ON storage.objects;
CREATE POLICY "portfolio_storage_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'portfolio'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
