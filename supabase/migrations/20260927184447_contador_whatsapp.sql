-- Contador dos botões "Contactar pelo WhatsApp".
--
-- Cada clique num botão de WhatsApp (propostas em pedido.html ou "WhatsApp a
-- profissional" no admin) fica registado, para o profissional e o admin
-- saberem quantas vezes foi contactado. Não se guarda a mensagem: só quem
-- clicou, para quem e em que pedido. Um clique só conta como contacto novo
-- se a mesma pessoa não tiver contactado o mesmo profissional sobre o mesmo
-- pedido nas últimas 24 horas (evita contagens infladas por cliques repetidos).
create table if not exists public.whatsapp_contactos (
  id bigint generated always as identity primary key,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.requests(id) on delete set null,
  clicked_by uuid references public.profiles(id) on delete set null,
  source text not null check (source in ('proposta', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists whatsapp_contactos_pro_idx on public.whatsapp_contactos (professional_id, created_at desc);
alter table public.whatsapp_contactos enable row level security;
revoke all on public.whatsapp_contactos from anon;
grant select on public.whatsapp_contactos to authenticated;

-- O profissional vê os seus contactos; o admin vê todos. Ninguém insere
-- diretamente: só através de registar_contacto_whatsapp().
drop policy if exists whatsapp_contactos_select on public.whatsapp_contactos;
create policy whatsapp_contactos_select on public.whatsapp_contactos
  for select to authenticated using (professional_id = auth.uid() or public.is_admin());

create or replace function public.registar_contacto_whatsapp(p_professional uuid, p_request uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_source text;
begin
  if auth.uid() is null or p_professional is null then return false; end if;
  if public.is_admin() then
    v_source := 'admin';
  elsif exists (
    select 1 from public.requests r
    join public.request_offers o on o.request_id = r.id and o.professional_id = p_professional
    join public.profile_private pp on pp.profile_id = p_professional and pp.whatsapp_visivel
    where r.id = p_request and r.client_id = auth.uid()
  ) then
    v_source := 'proposta';
  else
    return false;
  end if;
  if exists (
    select 1 from public.whatsapp_contactos
    where clicked_by = auth.uid() and professional_id = p_professional
      and request_id is not distinct from p_request and created_at > now() - interval '24 hours'
  ) then
    return false;
  end if;
  insert into public.whatsapp_contactos (professional_id, request_id, clicked_by, source)
  values (p_professional, p_request, auth.uid(), v_source);
  return true;
end;
$$;
revoke all on function public.registar_contacto_whatsapp(uuid, uuid) from public, anon;
grant execute on function public.registar_contacto_whatsapp(uuid, uuid) to authenticated;
