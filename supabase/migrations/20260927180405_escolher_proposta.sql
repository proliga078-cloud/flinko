-- Propostas: escolher a melhor e seguir para a conversa e o trabalho.
--
-- Antes, o cliente via as propostas mas não havia forma de escolher nenhuma, o
-- profissional nunca sabia se tinha sido escolhido e ninguém era avisado de
-- uma proposta nova. Agora cada proposta tem estado (à espera / escolhida /
-- não escolhida) e escolher_proposta() faz tudo numa só transação:
-- marca a escolhida e as restantes, fecha o pedido, abre (ou reaproveita) a
-- conversa com uma primeira mensagem e cria o trabalho no dashboard do
-- profissional, com o valor da proposta.

alter table public.request_offers add column if not exists status text not null default 'pending';
alter table public.request_offers drop constraint if exists request_offers_status_check;
alter table public.request_offers add constraint request_offers_status_check check (status in ('pending', 'accepted', 'declined'));
alter table public.request_offers add column if not exists decided_at timestamptz;
alter table public.request_offers add column if not exists notified_at timestamptz;

-- O profissional continua a poder editar a mensagem e o preço, mas o estado só
-- muda através de escolher_proposta() (ou pelo servidor).
create or replace function public.protect_offer_status()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_setting('app.offer_decision', true) = 'on' or auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.decided_at := null;
    new.notified_at := null;
    -- não se propõe a pedidos já fechados
    if exists (select 1 from public.requests r where r.id = new.request_id and coalesce(r.status, 'open') <> 'open') then
      raise exception 'Este pedido já não aceita propostas.';
    end if;
  else
    new.status := old.status;
    new.decided_at := old.decided_at;
    new.notified_at := old.notified_at;
    if old.status <> 'pending' and (new.price_from is distinct from old.price_from or new.price_to is distinct from old.price_to) then
      raise exception 'Esta proposta já foi decidida e não pode ser alterada.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_offer_status() from public, anon, authenticated;
drop trigger if exists protect_offer_status_trg on public.request_offers;
create trigger protect_offer_status_trg before insert or update on public.request_offers
  for each row execute function public.protect_offer_status();

create or replace function public.escolher_proposta(p_offer uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  o public.request_offers;
  r public.requests;
  v_conv uuid;
  v_nome text;
begin
  select * into o from public.request_offers where id = p_offer for update;
  if not found then raise exception 'Proposta não encontrada.'; end if;
  select * into r from public.requests where id = o.request_id for update;
  if r.client_id is distinct from auth.uid() then raise exception 'Só quem publicou o pedido pode escolher uma proposta.'; end if;
  if o.status = 'accepted' then
    select id into v_conv from public.conversations where professional_id = o.professional_id and client_id = r.client_id order by created_at limit 1;
    return v_conv;
  end if;
  if coalesce(r.status, 'open') <> 'open' then raise exception 'Este pedido já está fechado.'; end if;

  perform set_config('app.offer_decision', 'on', true);
  update public.request_offers set status = 'accepted', decided_at = now() where id = o.id;
  update public.request_offers set status = 'declined', decided_at = now() where request_id = o.request_id and id <> o.id and status = 'pending';
  update public.requests set status = 'resolved' where id = r.id;

  -- conversa entre os dois (reaproveita se já existir)
  select id into v_conv from public.conversations
    where (professional_id = o.professional_id and client_id = r.client_id) or (professional_id = r.client_id and client_id = o.professional_id)
    order by created_at limit 1;
  if v_conv is null then
    insert into public.conversations (professional_id, client_id) values (o.professional_id, r.client_id) returning id into v_conv;
  end if;
  insert into public.messages (conversation_id, sender_id, content)
    values (v_conv, r.client_id, 'Olá! Escolhi a tua proposta para «' || left(r.title, 120) || '». Vamos combinar os detalhes?');

  -- trabalho no dashboard do profissional
  select name into v_nome from public.profiles where id = r.client_id;
  insert into public.jobs (professional_id, client_id, conversation_id, title, client_name, status, quote_amount, quote_accepted_at)
    values (o.professional_id, r.client_id, v_conv, left(r.title, 200), v_nome, 'aceite', o.price_from, now());

  return v_conv;
end;
$$;
revoke all on function public.escolher_proposta(uuid) from public, anon;
grant execute on function public.escolher_proposta(uuid) to authenticated;
