-- PROLIGA - Schema da Base de Dados
--
-- ATENCAO: este ficheiro e um RESUMO manual, mantido a olho, e nao a fonte
-- de verdade. A fonte de verdade real e cronologica da base de dados esta
-- em supabase/migrations/ (69 migracoes, extraidas a 21 de agosto de 2026
-- diretamente da tabela supabase_migrations.schema_migrations do Supabase,
-- que ate essa data nunca tinha sido trazida para o git). Ver
-- supabase/migrations/README.md para o workflow daqui para a frente.
--
-- Snapshot de referência da estrutura REAL em produção (Supabase), a
-- 27 de julho de 2026. A base de dados evoluiu bastante além do desenho
-- inicial (chat completo, pedidos, portefólio, telefone privado) e este
-- ficheiro estava desatualizado — foi reescrito para refletir a realidade.
-- Nota: a BD viva tem algumas políticas RLS duplicadas/redundantes
-- (mesma regra criada duas vezes com nomes diferentes ao longo do tempo).
-- Este ficheiro documenta o COMPORTAMENTO pretendido de forma limpa,
-- não um dump literal linha a linha de cada política duplicada. Sabe-se
-- também que este resumo ainda não cobre todas as tabelas/triggers reais
-- (ex: credits, ad_slots, request_offers, plan_limits, reserved_slugs,
-- bucket proliga-media, trigger protect_privileged_profile_columns) —
-- para a lista completa e exata, consulta supabase/migrations/.

-- ============================================================
-- PROFILES — um perfil por utilizador (cliente e/ou profissional)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  user_id UUID UNIQUE,                    -- espelha auth.users.id (usado em vários selects)
  name TEXT NOT NULL,
  email TEXT,
  bio TEXT,
  photo_url TEXT,
  cover_url TEXT,
  category TEXT,                          -- vazio = ainda não é profissional / cliente puro
  location TEXT,
  website TEXT,
  verified BOOLEAN DEFAULT FALSE,
  plan TEXT DEFAULT 'free',               -- free | pro | premium
  plan_expires_at TIMESTAMPTZ,
  approved BOOLEAN DEFAULT TRUE,
  suspended BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  is_demo BOOLEAN DEFAULT FALSE,          -- reservado para marcar contas de demonstração
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- NOTA DE PRIVACIDADE: o telefone NÃO vive nesta tabela (ver profile_private
-- abaixo). Esta tabela é lida publicamente (perfis, categorias, pesquisa),
-- por isso qualquer coluna aqui é, na prática, pública.

-- ============================================================
-- PROFILE_PRIVATE — dados de contacto privados (só o dono ou admin veem)
-- ============================================================
CREATE TABLE IF NOT EXISTS profile_private (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  phone TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profile_private ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_private_select_own_or_admin" ON profile_private
  FOR SELECT USING (auth.uid() = profile_id OR EXISTS (SELECT 1 FROM profiles ap WHERE ap.id = auth.uid() AND ap.is_admin = true));
CREATE POLICY "profile_private_insert_own" ON profile_private
  FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "profile_private_update_own_or_admin" ON profile_private
  FOR UPDATE USING (auth.uid() = profile_id OR EXISTS (SELECT 1 FROM profiles ap WHERE ap.id = auth.uid() AND ap.is_admin = true));

-- ============================================================
-- SERVICES — serviços oferecidos por um profissional
-- ============================================================
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_from NUMERIC,
  price_to NUMERIC,
  price_unit TEXT DEFAULT 'hora',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "services_select" ON services FOR SELECT USING (true);
CREATE POLICY "services_insert" ON services FOR INSERT WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "services_update" ON services FOR UPDATE USING (auth.uid() = professional_id);
CREATE POLICY "services_delete" ON services FOR DELETE USING (auth.uid() = professional_id);
CREATE POLICY "admin_all_services" ON services FOR ALL USING (is_admin());

-- ============================================================
-- PORTFOLIO_ITEMS — fotos de trabalhos anteriores
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portfolio_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_select" ON portfolio_items FOR SELECT USING (true);
CREATE POLICY "portfolio_insert" ON portfolio_items FOR INSERT WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "portfolio_delete" ON portfolio_items FOR DELETE USING (auth.uid() = professional_id);
CREATE POLICY "admin_all_portfolio" ON portfolio_items FOR ALL USING (is_admin());

-- ============================================================
-- REVIEWS — avaliações, ligadas a uma conversa real (não a formulário livre)
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews_select" ON reviews FOR SELECT USING (true);
-- só pode avaliar quem partilha (ou partilhou) uma conversa real com o profissional
CREATE POLICY "reviews_insert" ON reviews FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL AND auth.uid() = client_id AND EXISTS (
    SELECT 1 FROM conversations c
    WHERE (c.client_id = auth.uid() AND c.professional_id = reviews.professional_id)
       OR (c.professional_id = auth.uid() AND c.client_id = reviews.professional_id)
  )
);
CREATE POLICY "reviews_delete_own" ON reviews FOR DELETE USING (auth.uid() = client_id);
CREATE POLICY "admin_all_reviews" ON reviews FOR ALL USING (is_admin());

-- ============================================================
-- CONVERSATIONS + MESSAGES — o "mensager": chat real dentro da Proliga
-- Substitui o antigo formulário de contacto de sentido único.
-- ============================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (auth.uid() = professional_id OR auth.uid() = client_id);
CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() = client_id OR auth.uid() = professional_id);
CREATE POLICY "admin_select_conversations" ON conversations FOR SELECT USING (is_admin());

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (c.professional_id = auth.uid() OR c.client_id = auth.uid()))
);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (c.professional_id = auth.uid() OR c.client_id = auth.uid()))
);
CREATE POLICY "messages_update" ON messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND (c.professional_id = auth.uid() OR c.client_id = auth.uid()))
);
CREATE POLICY "admin_select_messages" ON messages FOR SELECT USING (is_admin());

-- Trigger sugerido (já existe em produção como update_conversation_last_message):
-- mantém conversations.last_message / last_message_at sincronizados a cada INSERT em messages.

-- ============================================================
-- MESSAGES_LEGACY_CONTACT_FORM — DEPRECATED
-- Formulário de contacto de sentido único, substituído pelo chat acima.
-- Mantido só para não perder histórico; nenhuma página insere aqui.
-- ============================================================
CREATE TABLE IF NOT EXISTS messages_legacy_contact_form (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_phone TEXT,
  subject TEXT NOT NULL,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE messages_legacy_contact_form ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON messages_legacy_contact_form FOR SELECT USING (auth.uid() = professional_id);
CREATE POLICY "messages_update" ON messages_legacy_contact_form FOR UPDATE USING (auth.uid() = professional_id);
CREATE POLICY "admin_select_legacy" ON messages_legacy_contact_form FOR SELECT USING (is_admin());
CREATE POLICY "admin_delete_legacy" ON messages_legacy_contact_form FOR DELETE USING (is_admin());

-- ============================================================
-- REQUESTS — pedidos publicados por clientes ("O que os clientes precisam")
-- ============================================================
CREATE TABLE IF NOT EXISTS requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  budget_from NUMERIC,
  budget_to NUMERIC,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests_select" ON requests FOR SELECT USING (true);
CREATE POLICY "requests_insert" ON requests FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "requests_update" ON requests FOR UPDATE USING (auth.uid() = client_id);
CREATE POLICY "requests_delete" ON requests FOR DELETE USING (auth.uid() = client_id);
CREATE POLICY "admin_all_requests" ON requests FOR ALL USING (is_admin());

-- ============================================================
-- STORAGE — fotos de perfil e portefólio
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('portfolio', 'portfolio', true) ON CONFLICT DO NOTHING;

CREATE POLICY "avatars_select" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "portfolio_storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'portfolio');

-- ============================================================
-- FUNÇÕES DE SUPORTE (já existentes em produção — listadas para referência)
-- ============================================================
-- is_admin()                        -> usada pelas políticas "admin_*" acima
-- auto_confirm_email()               -> confirma email automaticamente no signup
-- protect_plan_columns()             -> impede que o próprio utilizador se auto-promova de plano
-- enforce_service_limit()            -> limita nº de serviços consoante o plano (2/10/ilimitado)
-- enforce_portfolio_limit()          -> limita nº de fotos de portefólio consoante o plano
-- update_conversation_last_message() -> mantém conversations.last_message sincronizado

-- ============================================================
-- JOBS — pipeline de trabalhos do profissional (dashboard "Trabalhos")
-- Cobre todo o ciclo: novo contacto -> orçamento -> agendado -> concluído -> pago.
-- ============================================================
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  title text NOT NULL,
  client_name text,
  status text NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','negociacao','orcamento_enviado','aceite','agendado','concluido','pago','cancelado')),
  quote_amount numeric,
  quote_sent_at timestamptz,
  quote_accepted_at timestamptz,
  scheduled_at timestamptz,
  scheduled_notes text,
  completed_at timestamptz,
  paid_at timestamptz,
  paid_amount numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: profissional dono (auth.uid() = professional_id) pode ver/criar/editar/apagar os seus;
-- cliente associado (auth.uid() = client_id) também pode ver; admin vê/edita/apaga tudo via is_admin().
-- Tabela adicionada à publicação supabase_realtime para o dashboard atualizar Pipeline/Agenda/
-- estatísticas em tempo real sem refresh (ver dashboard.html: subscribeJobsRealtime()).

-- ============================================================
-- PROFILE_VIEWS — registo diário de visualizações de perfil (para o gráfico "Visualizações")
-- ============================================================
CREATE TABLE profile_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  viewed_at date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Qualquer visitante (incl. anónimo) pode inserir uma linha ao abrir profile.html
-- (throttled a 1x/dia/perfil por localStorage no browser — não é um limite de segurança,
-- só evita inflacionar o contador em recarregamentos). Só o dono do perfil (ou admin) pode
-- ler o histórico. O próprio profissional a ver o seu perfil não gera uma view.

-- ============================================================
-- EDGE FUNCTION: ai-assistant
-- Chat de IA no dashboard. Recebe {question}, usa o JWT do profissional para ler
-- (via RLS, sem service role) os seus próprios jobs/serviços/avaliações, monta um
-- resumo e chama a API da Anthropic (modelo claude-haiku) para responder em pt-PT.
-- Requer a secret ANTHROPIC_API_KEY configurada no projeto Supabase
-- (Project Settings -> Edge Functions -> Secrets). Sem a chave, devolve
-- {error:'not_configured'} e o dashboard mostra uma mensagem amigável em vez de falhar.
-- ============================================================

-- ============================================================
-- NOTA DE SEGURANÇA (atualizado a 21 de agosto de 2026):
-- - Search_path fixo nas funções SECURITY DEFINER: feito (verificado --
--   nenhuma função SECURITY DEFINER em public está sem search_path pinado).
-- - Listagem pública dos buckets avatars/portfolio/proliga-media: feito --
--   SELECT em storage.objects agora exige sessão (authenticated). A leitura
--   por URL direto continua a funcionar para toda a gente (buckets são
--   "public"), só deixou de ser possível listar TODOS os ficheiros sem
--   conta nenhuma. Ver supabase/migrations/20260821223819_*.
-- - Ativar "Leaked Password Protection" nas definições de Auth: por fazer.
--   É um toggle em Authentication -> Providers -> Password no dashboard do
--   Supabase, não uma migration -- só o dono da conta consegue ativá-lo.
-- ============================================================
