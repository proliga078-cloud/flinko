-- Pedidos de verificação de profissionais: o profissional pede para ser
-- verificado e envia documentos (cartão de cidadão, comprovativo de
-- atividade, etc.) para um admin analisar manualmente. Espelha o padrão de
-- segurança de gdpr_requests: o dono só pode criar/ver os próprios pedidos
-- e só pode cancelar um pedido ainda pendente; só um admin pode
-- aprovar/rejeitar (e nesse momento marca profiles.verified = true).

create table if not exists verification_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  documents jsonb not null default '[]'::jsonb,
  notes text,
  admin_notes text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
  );

create index if not exists verification_requests_profile_id_idx on verification_requests(profile_id);
create index if not exists verification_requests_status_idx on verification_requests(status);

alter table verification_requests enable row level security;

create policy verification_insert_own on verification_requests
  for insert
  with check (profile_id = auth.uid());

create policy verification_select on verification_requests
  for select
  using (is_admin() or profile_id = auth.uid());

-- O próprio só pode mexer no pedido enquanto está pendente, e só para o
-- cancelar (nunca para o aprovar/rejeitar ou tocar nos campos de admin).
-- Um admin pode atualizar em qualquer estado.
create policy verification_update on verification_requests
  for update
  using (is_admin() or (profile_id = auth.uid() and status = 'pending'))
  with check (is_admin() or (profile_id = auth.uid() and status = 'cancelled'));

-- Storage: bucket privado para os documentos de verificação. Cada ficheiro
-- fica em `<profile_id>/<ficheiro>` — as políticas usam essa pasta para
-- restringir o acesso ao próprio profissional (via auth.uid()) ou a um admin.
-- Ao contrário de avatars/portfolio/proliga-media, este bucket NÃO é
-- público: os documentos só são acedidos via signed URL.
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

create policy verification_docs_insert_own on storage.objects
  for insert
  with check (
  bucket_id = 'verification-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy verification_docs_select on storage.objects
  for select
  using (
  bucket_id = 'verification-docs'
  and ((storage.foldername(name))[1] = auth.uid()::text or is_admin())
  );

create policy verification_docs_delete_own on storage.objects
  for delete
  using (
  bucket_id = 'verification-docs'
  and (storage.foldername(name))[1] = auth.uid()::text
  );
