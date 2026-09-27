-- Mensagens da Flinko para profissionais (enviadas a partir do admin).
--
-- O admin escreve no painel e a função admin-flinko-message cria (ou
-- reaproveita) uma conversa entre a conta do admin e cada profissional,
-- marcada como is_flinko. Na página de mensagens, o profissional vê essa
-- conversa como "Flinko" (conta oficial) e pode responder normalmente.
--
-- Só o servidor (chave de serviço) pode marcar uma conversa como da Flinko:
-- ninguém se consegue fazer passar pela Flinko numa conversa normal.
alter table public.conversations add column if not exists is_flinko boolean not null default false;

create or replace function public.protect_conversation_flinko()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.is_flinko := false;
  else
    new.is_flinko := old.is_flinko;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_conversation_flinko() from public, anon, authenticated;
drop trigger if exists protect_conversation_flinko_trg on public.conversations;
create trigger protect_conversation_flinko_trg before insert or update on public.conversations
  for each row execute function public.protect_conversation_flinko();
