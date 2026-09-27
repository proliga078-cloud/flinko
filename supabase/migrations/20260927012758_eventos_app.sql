-- Eventos da app instalável (assets/pwa.js): carregar em "Instalar a app" e a
-- app ficar instalada. Acrescenta estes dois nomes à lista aceite em
-- site_events (ver a migração eventos_funil).
alter table public.site_events drop constraint if exists site_events_name_check;
alter table public.site_events add constraint site_events_name_check
  check (name in ('pesquisa', 'perfil_contactar', 'pedido_iniciado', 'pedido_publicado', 'conta_criada', 'app_instalar_clique', 'app_instalada'));
