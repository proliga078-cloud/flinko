-- Sem duracao era impossivel saber se dois trabalhos se sobrepoem:
-- so existia a hora de inicio.
alter table public.jobs
  add column if not exists duration_minutes integer not null default 60;

alter table public.jobs drop constraint if exists jobs_duration_sensata;
alter table public.jobs add constraint jobs_duration_sensata
  check (duration_minutes > 0 and duration_minutes <= 24*60);

create index if not exists jobs_agenda_idx
  on public.jobs(professional_id, scheduled_at)
  where scheduled_at is not null;
