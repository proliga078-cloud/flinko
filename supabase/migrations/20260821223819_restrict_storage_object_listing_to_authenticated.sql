-- As politicas de SELECT em storage.objects para os buckets avatars,
-- portfolio e proliga-media nao tinham NENHUMA restricao de role (roles =
-- {public}, ou seja, qualquer visitante anonimo, sem conta nenhuma).
--
-- Isto nao afeta a forma como as imagens aparecem nas paginas publicas
-- (categoria, perfil, etc.): os 3 buckets sao "public" (storage.buckets.public
-- = true), e um bucket publico serve sempre os ficheiros pelo URL direto
-- (/storage/v1/object/public/...) independentemente de RLS -- e assim que
-- <img src="..."> sempre funcionou e continua a funcionar.
--
-- O que esta policy realmente controlava era a capacidade de LISTAR/
-- enumerar TODOS os ficheiros de um bucket sem ja saber o caminho exato
-- (endpoint /storage/v1/object/list/{bucket}), e nenhuma pagina do site
-- alguma vez chama esse endpoint (confirmado: zero ocorrencias de
-- `.storage.from(...).list(` no codigo). Isso significava que qualquer
-- pessoa, sem conta nenhuma, conseguia listar de uma vez todas as fotos
-- de diario, portefolio, avatares, anuncios E PEDIDOS de todos os
-- utilizadores -- incluindo fotos de pedidos ainda dentro da janela paga
-- de acesso antecipado (my_request_delay_minutes()), que a tabela
-- `requests` protege mas o storage nao protegia nada.
--
-- Corrigido: listar exige sessao (authenticated). Continua a nao restringir
-- por dono, porque o proprio produto depende de mostrar ficheiros de
-- OUTRAS pessoas a quem tem sessao (perfis de outros profissionais, etc.) --
-- so fecha a enumeracao completamente anonima.

drop policy if exists "avatars_select" on storage.objects;
create policy "avatars_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

drop policy if exists "portfolio_storage_select" on storage.objects;
create policy "portfolio_storage_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'portfolio');

drop policy if exists "proliga_media_select" on storage.objects;
create policy "proliga_media_select" on storage.objects for select
  to authenticated
  using (bucket_id = 'proliga-media');
