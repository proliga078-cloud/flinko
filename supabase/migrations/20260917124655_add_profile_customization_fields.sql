
alter table public.profiles
  add column if not exists theme_color text,
  add column if not exists custom_sections jsonb not null default '[]'::jsonb,
  add column if not exists section_order jsonb,
  add column if not exists hidden_sections text[] not null default '{}'::text[];

comment on column public.profiles.theme_color is 'Chave de uma paleta de acento pré-definida (ex: orange, blue, green, purple, red, teal). Null = paleta default (laranja).';
comment on column public.profiles.custom_sections is 'Secoes de texto livre escritas pelo profissional: array de {title, body}. A ordem do array define a ordem de exibicao.';
comment on column public.profiles.section_order is 'Ordem escolhida pelo profissional para as seccoes do perfil publico: {"tabs":[...],"sidebar":[...]}. Null = ordem default.';
comment on column public.profiles.hidden_sections is 'Chaves de seccoes que o profissional escolheu esconder do perfil publico (ex: diario, video).';
