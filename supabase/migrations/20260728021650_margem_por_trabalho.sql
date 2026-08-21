alter table public.jobs
  add column if not exists material_cost numeric,
  add column if not exists job_type text;

comment on column public.jobs.material_cost is 'Custo de material suportado pelo profissional neste trabalho (euros)';
comment on column public.jobs.job_type is 'Tipo de trabalho para agrupar analise de margem (ex: Reparacao, Instalacao completa)';

create index if not exists jobs_type_idx on public.jobs (professional_id, job_type) where job_type is not null;
