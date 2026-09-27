-- Mensagens ao nível das apps de chat: fotos, responder a uma mensagem,
-- "visto às", reações e pré-visualização "📷 Foto" na lista de conversas.

-- 1. Novas colunas em messages ------------------------------------------------
alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists read_at timestamptz;

alter table public.messages drop constraint if exists messages_attachments_check;
alter table public.messages add constraint messages_attachments_check
  check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 4);

-- Uma mensagem tem texto ou pelo menos uma foto; texto até 5000 caracteres.
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check
  check (length(content) <= 5000 and (length(btrim(content)) > 0 or jsonb_array_length(attachments) > 0));

create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_unread_idx on public.messages (conversation_id) where read = false;

-- 2. Proteção: depois de enviada, só o estado de leitura muda ------------------
-- (o resto continua congelado, como antes; agora também as fotos e a resposta)
create or replace function public.protect_message_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    new.sender_id := old.sender_id;
    new.content := old.content;
    new.conversation_id := old.conversation_id;
    new.created_at := old.created_at;
    new.attachments := old.attachments;
    new.reply_to := old.reply_to;
    -- só quem recebe marca como lida (e não se "desmarca")
    if old.read or auth.uid() = old.sender_id then
      new.read := old.read;
    end if;
  end if;
  if new.read and not coalesce(old.read, false) then
    new.read_at := now();
  else
    new.read_at := old.read_at;
  end if;
  return new;
end;
$$;

-- Na inserção: as fotos têm de estar na pasta desta conversa e a resposta tem
-- de ser a uma mensagem da mesma conversa.
create or replace function public.check_new_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a jsonb;
begin
  for a in select * from jsonb_array_elements(new.attachments) loop
    if jsonb_typeof(a) <> 'object'
       or coalesce(a->>'path', '') !~ ('^' || new.conversation_id::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'anexo inválido';
    end if;
  end loop;
  if new.reply_to is not null and not exists (
    select 1 from public.messages m where m.id = new.reply_to and m.conversation_id = new.conversation_id
  ) then
    new.reply_to := null;
  end if;
  new.read := false;
  new.read_at := null;
  return new;
end;
$$;

revoke all on function public.check_new_message() from public, anon, authenticated;
drop trigger if exists check_new_message_trg on public.messages;
create trigger check_new_message_trg before insert on public.messages
  for each row execute function public.check_new_message();

-- 3. Lista de conversas: "📷 Foto" quando a mensagem não tem texto -----------
create or replace function public.update_conversation_last_message()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  update public.conversations
  set last_message = case
        when length(btrim(new.content)) > 0 then left(new.content, 300)
        when jsonb_array_length(new.attachments) > 1 then '📷 ' || jsonb_array_length(new.attachments) || ' fotos'
        else '📷 Foto'
      end,
      last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

-- 4. Reações -------------------------------------------------------------------
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '👍', '😂', '😮', '🙏', '👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reactions enable row level security;

create or replace function public.is_message_participant(p_message uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
    where m.id = p_message and (c.professional_id = auth.uid() or c.client_id = auth.uid())
  )
$$;
revoke all on function public.is_message_participant(uuid) from public, anon;
grant execute on function public.is_message_participant(uuid) to authenticated;

drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions
  for select to authenticated using (public.is_message_participant(message_id));
drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions
  for insert to authenticated with check (user_id = auth.uid() and public.is_message_participant(message_id));
drop policy if exists message_reactions_update on public.message_reactions;
create policy message_reactions_update on public.message_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

-- 5. Fotos: armazenamento PRIVADO, só os dois participantes da conversa -------
-- Caminho: <conversation_id>/<ficheiro>. Mostram-se com links temporários.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.is_conversation_participant(p_conversation text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.conversations c
    where c.id::text = p_conversation and (c.professional_id = auth.uid() or c.client_id = auth.uid())
  )
$$;
revoke all on function public.is_conversation_participant(text) from public, anon;
grant execute on function public.is_conversation_participant(text) to authenticated;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-media' and public.is_conversation_participant((storage.foldername(name))[1]));
drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media' and public.is_conversation_participant((storage.foldername(name))[1]));

-- 6. Tempo real: reações e "visto" chegam sem recarregar -----------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_reactions') then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
exception when undefined_object then null;
end $$;
