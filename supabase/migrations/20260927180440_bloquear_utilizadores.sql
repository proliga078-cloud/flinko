-- Bloquear alguém nas mensagens.
--
-- Quem bloqueia deixa de receber mensagens dessa pessoa, e nenhum dos dois
-- consegue enviar mensagens na conversa enquanto o bloqueio existir. A regra
-- está na base de dados (trigger), por isso vale mesmo para quem chame a API
-- diretamente. Denunciar usa a tabela support_tickets (kind = 'denuncia'),
-- que já aparece no painel de gestão.

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select on public.user_blocks;
create policy user_blocks_select on public.user_blocks for select to authenticated using (blocker_id = auth.uid() or public.is_admin());
drop policy if exists user_blocks_insert on public.user_blocks;
create policy user_blocks_insert on public.user_blocks for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists user_blocks_delete on public.user_blocks;
create policy user_blocks_delete on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());

create or replace function public.check_message_block()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_other uuid;
begin
  if auth.role() = 'service_role' then return new; end if;
  select case when c.professional_id = new.sender_id then c.client_id else c.professional_id end
    into v_other from public.conversations c where c.id = new.conversation_id;
  if v_other is not null and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = new.sender_id and b.blocked_id = v_other)
       or (b.blocker_id = v_other and b.blocked_id = new.sender_id)
  ) then
    raise exception 'Não é possível enviar mensagens nesta conversa.';
  end if;
  return new;
end;
$$;
revoke all on function public.check_message_block() from public, anon, authenticated;
drop trigger if exists check_message_block_trg on public.messages;
create trigger check_message_block_trg before insert on public.messages
  for each row execute function public.check_message_block();
