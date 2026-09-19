-- notify-request.js passa a marcar cada pedido como "ja notificado" de forma
-- atomica. Sem isto, chamar a function varias vezes com o mesmo requestId
-- reenviava os emails todas as vezes (email-bombing a partir da conta de
-- qualquer cliente). O limite por cliente tambem se apoia nesta coluna.
alter table public.requests add column if not exists notified_at timestamptz;
create index if not exists requests_client_notified_idx on public.requests (client_id, notified_at);
