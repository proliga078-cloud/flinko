-- Antes: só quem tinha sessão iniciada E já tinha tido uma conversa (chat)
-- com o profissional podia deixar avaliação. Pedido do utilizador (2026-09):
-- abrir totalmente, sem sessão nem contacto prévio pela plataforma.
-- Passa a exigir só o mínimo para a avaliação fazer sentido/ser rastreável:
-- nome+email de quem avalia, nota 1-5, e o profissional avaliado tem de
-- existir de facto. Se houver sessão, o client_id continua a ter de ser o
-- da própria pessoa (nunca pode ser atribuído a outra conta).
drop policy if exists "reviews_insert" on public.reviews;

create policy "reviews_insert" on public.reviews for insert to public with check (
  rating between 1 and 5
  and reviewer_name is not null and length(trim(reviewer_name)) > 0
  and reviewer_email is not null and reviewer_email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  and exists (select 1 from profiles p where p.id = reviews.professional_id)
  and (client_id is null or client_id = (select auth.uid()))
);

comment on policy "reviews_insert" on public.reviews is 'Aberto a qualquer visitante (com ou sem conta) desde 2026-09 — antes exigia sessão + conversa prévia com o profissional. Ver flinko-status.md Fase 20.';
