-- ============================================================
-- 1. Registo de avisos enviados, para nao mandar um email por
--    cada mensagem numa conversa.
-- ============================================================
create table if not exists public.message_notices(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  recipient_id uuid not null,
  sent_at timestamptz not null default now()
);

create index if not exists message_notices_lookup
  on public.message_notices(conversation_id, recipient_id, sent_at desc);

alter table public.message_notices enable row level security;
-- Ninguem le nem escreve isto pelo browser. So a funcao no servidor,
-- que usa a chave de servico e ignora RLS.
drop policy if exists message_notices_none on public.message_notices;

-- ============================================================
-- 2. Deixar de expor os emails na API publica.
--    A tabela profiles continua legivel, mas a coluna email
--    deixa de estar acessivel a quem vem do browser.
-- ============================================================
revoke select (email) on public.profiles from anon;
revoke select (email) on public.profiles from authenticated;

-- Cada pessoa continua a poder ver o SEU proprio email, atraves
-- desta funcao, que so devolve a linha de quem esta autenticado.
create or replace function public.my_email()
returns text language sql stable security definer set search_path=public as $$
  select email from public.profiles where id = auth.uid()
$$;

grant execute on function public.my_email() to authenticated;
