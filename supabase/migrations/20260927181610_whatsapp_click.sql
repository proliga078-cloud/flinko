-- WhatsApp sem Twilio: "Click to WhatsApp" (links wa.me).
--
-- Os alertas automáticos por WhatsApp (Twilio) saíram. As colunas que existiam
-- para eles passam a guardar o consentimento do profissional para mostrar o
-- botão "Contactar pelo WhatsApp" aos clientes a quem enviou propostas.
-- Renomear (em vez de apagar) mantém quaisquer dados já gravados.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'whatsapp_alerts') then
    alter table public.profile_private rename column whatsapp_alerts to whatsapp_visivel;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profile_private' and column_name = 'whatsapp_opt_in_at') then
    alter table public.profile_private rename column whatsapp_opt_in_at to whatsapp_visivel_at;
  end if;
end $$;
alter table public.profile_private add column if not exists whatsapp_visivel boolean not null default false;
alter table public.profile_private add column if not exists whatsapp_visivel_at timestamptz;

-- Telemóvel dos profissionais que responderam a um pedido, só para o cliente
-- dono desse pedido e só de quem aceitou mostrar o WhatsApp. O resto dos
-- números continua privado (profile_private só é lido pelo próprio e pelo admin).
create or replace function public.whatsapp_das_propostas(p_request uuid)
returns table (professional_id uuid, phone text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select o.professional_id, pp.phone
  from public.requests r
  join public.request_offers o on o.request_id = r.id
  join public.profile_private pp on pp.profile_id = o.professional_id
  where r.id = p_request
    and r.client_id = auth.uid()
    and pp.whatsapp_visivel
    and coalesce(btrim(pp.phone), '') <> ''
$$;
revoke all on function public.whatsapp_das_propostas(uuid) from public, anon;
grant execute on function public.whatsapp_das_propostas(uuid) to authenticated;
