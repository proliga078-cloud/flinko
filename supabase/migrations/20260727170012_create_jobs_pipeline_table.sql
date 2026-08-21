CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  client_name TEXT,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','negociacao','orcamento_enviado','aceite','agendado','concluido','pago','cancelado')),
  quote_amount NUMERIC,
  quote_sent_at TIMESTAMPTZ,
  quote_accepted_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  scheduled_notes TEXT,
  completed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_select_own" ON jobs FOR SELECT USING (auth.uid() = professional_id OR auth.uid() = client_id);
CREATE POLICY "jobs_insert_own" ON jobs FOR INSERT WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "jobs_update_own" ON jobs FOR UPDATE USING (auth.uid() = professional_id) WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "jobs_delete_own" ON jobs FOR DELETE USING (auth.uid() = professional_id);
CREATE POLICY "admin_select_jobs" ON jobs FOR SELECT USING (is_admin());
CREATE POLICY "admin_update_jobs" ON jobs FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin_delete_jobs" ON jobs FOR DELETE USING (is_admin());

CREATE INDEX idx_jobs_professional ON jobs(professional_id);
CREATE INDEX idx_jobs_status ON jobs(professional_id, status);
CREATE INDEX idx_jobs_scheduled ON jobs(professional_id, scheduled_at);

CREATE OR REPLACE FUNCTION jobs_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION jobs_set_updated_at();
