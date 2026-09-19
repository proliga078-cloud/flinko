
alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists intro_video_url text,
  add column if not exists awards jsonb not null default '[]'::jsonb,
  add column if not exists promotions jsonb not null default '[]'::jsonb;

comment on column public.profiles.social_links is
  'Links de redes sociais do profissional: {instagram, facebook, whatsapp, tiktok, youtube, linkedin}. Todas as chaves são opcionais.';
comment on column public.profiles.intro_video_url is
  'Link de vídeo de apresentação do profissional (YouTube ou Vimeo).';
comment on column public.profiles.awards is
  'Array de prémios/distinções: [{title, issuer, year}]. Distinto de certifications (licenças/certificações profissionais).';
comment on column public.profiles.promotions is
  'Array de promoções ativas: [{title, description, valid_until}].';

grant select (social_links, intro_video_url, awards, promotions) on public.profiles to authenticated, anon;
grant update (social_links, intro_video_url, awards, promotions) on public.profiles to authenticated;
