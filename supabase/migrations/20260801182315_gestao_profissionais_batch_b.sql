-- 8) DESPESAS GERAIS DO NEGÓCIO
CREATE TABLE IF NOT EXISTS business_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category TEXT DEFAULT 'outro',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE business_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "business_expenses_select" ON business_expenses FOR SELECT USING (auth.uid() = professional_id);
CREATE POLICY "business_expenses_insert" ON business_expenses FOR INSERT WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "business_expenses_update" ON business_expenses FOR UPDATE USING (auth.uid() = professional_id);
CREATE POLICY "business_expenses_delete" ON business_expenses FOR DELETE USING (auth.uid() = professional_id);
CREATE POLICY "admin_all_business_expenses" ON business_expenses FOR ALL USING (is_admin());

-- 9) DISPONIBILIDADE SEMANAL FIXA
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_schedule JSONB DEFAULT '{}'::jsonb;

-- 10) LEMBRETES DE ACOMPANHAMENTO
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;
