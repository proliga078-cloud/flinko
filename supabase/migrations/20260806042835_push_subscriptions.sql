-- ============================================================
-- PROLIGA — Notificações push (PWA)
-- Cada subscrição representa um dispositivo/browser que aceitou
-- receber notificações. Uma pessoa pode ter várias (telemóvel +
-- computador). endpoint é único por dispositivo/browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subscriptions_select_own" ON push_subscriptions FOR SELECT USING (auth.uid() = profile_id);
CREATE POLICY "push_subscriptions_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "push_subscriptions_delete_own" ON push_subscriptions FOR DELETE USING (auth.uid() = profile_id);
CREATE POLICY "admin_all_push_subscriptions" ON push_subscriptions FOR ALL USING (is_admin());
-- Sem policy de UPDATE: uma subscricao nao se edita, apaga-se e cria-se outra.
