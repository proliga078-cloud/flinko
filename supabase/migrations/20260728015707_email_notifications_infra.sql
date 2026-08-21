create extension if not exists pg_net with schema extensions;

-- preferencia por perfil (default: receber)
alter table public.profiles
  add column if not exists notify_email boolean not null default true;

-- fila de notificacoes
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'new_message',
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  recipient_name text,
  sender_name text,
  preview text,
  conversation_id uuid,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_queue_pending_idx
  on public.notification_queue (status, created_at) where status = 'pending';

alter table public.notification_queue enable row level security;
-- ninguem acede pelo cliente; so service_role (que ignora RLS)
create policy nq_no_client_access on public.notification_queue for select using (false);
