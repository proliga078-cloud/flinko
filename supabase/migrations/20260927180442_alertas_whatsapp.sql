-- Alertas no WhatsApp para profissionais (opt-in).
--
-- Ficam em profile_private, ao lado do telemóvel: só o próprio (e o admin)
-- os lê. As funções do Netlify usam a chave de serviço para saber a quem enviar.
alter table public.profile_private add column if not exists whatsapp_alerts boolean not null default false;
alter table public.profile_private add column if not exists whatsapp_opt_in_at timestamptz;
