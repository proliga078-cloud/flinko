-- A tentativa anterior (REVOKE SELECT de colunas especificas) nao teve
-- efeito nenhum: o role authenticated tambem tinha um GRANT SELECT ao
-- nivel da TABELA inteira (por defeito do Supabase), que continua a dar
-- acesso a todas as colunas independentemente do que se revogar coluna a
-- coluna. Confirmado ao vivo (conta de teste continuou a conseguir ler
-- credits/is_admin/stripe_customer_id/plan_expires_at de outro perfil
-- depois da "correcao" anterior). A forma correta e a mesma usada para
-- anon na primeira ronda: revogar o SELECT da tabela toda e voltar a
-- conceder so as colunas publicas.
revoke select on public.profiles from authenticated;

grant select (
  id, name, bio, category, location, photo_url, plan, verified, created_at,
  slug, avg_response_minutes, response_sample_count, unavailable_until,
  unavailable_message, weekly_schedule, cover_url, certifications,
  has_insurance, experience_years, languages, specialties, website,
  is_demo, approved, suspended
) on public.profiles to authenticated;
