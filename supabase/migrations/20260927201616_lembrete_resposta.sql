-- Lembrete ao profissional quando um cliente está à espera de resposta.
--
-- A função reply-reminders (Netlify, de hora a hora) pede as conversas em
-- que a última mensagem é do cliente e tem entre 2 e 24 horas, e avisa o
-- profissional por email e push. Cada mensagem só gera um lembrete
-- (lembretes_resposta). Conversas oficiais da Flinko ficam de fora.
create table if not exists public.lembretes_resposta (
  message_id uuid primary key references public.messages(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.lembretes_resposta enable row level security;
-- sem políticas: só o servidor (chave de serviço) lê e escreve

create or replace function public.mensagens_por_responder(p_desde interval, p_ate interval)
returns table (message_id uuid, conversation_id uuid, professional_id uuid, client_id uuid, content text, created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id, c.id, c.professional_id, c.client_id, m.content, m.created_at
  from public.conversations c
  join lateral (
    select mm.id, mm.sender_id, mm.content, mm.created_at
    from public.messages mm
    where mm.conversation_id = c.id
    order by mm.created_at desc
    limit 1
  ) m on true
  where not c.is_flinko
    and c.last_message_at > now() - p_ate
    and m.sender_id = c.client_id
    and m.created_at <= now() - p_desde
    and m.created_at > now() - p_ate
    and not exists (select 1 from public.lembretes_resposta l where l.message_id = m.id)
  order by m.created_at
  limit 200
$$;
revoke all on function public.mensagens_por_responder(interval, interval) from public, anon, authenticated;
