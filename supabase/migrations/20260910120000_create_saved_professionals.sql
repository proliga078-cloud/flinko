CREATE TABLE IF NOT EXISTS saved_professionals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, professional_id)
  );

ALTER TABLE saved_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_professionals_select_own" ON saved_professionals FOR SELECT USING (auth.uid() = client_id);
CREATE POLICY "saved_professionals_insert_own" ON saved_professionals FOR INSERT WITH CHECK (auth.uid() = client_id);
CREATE POLICY "saved_professionals_delete_own" ON saved_professionals FOR DELETE USING (auth.uid() = client_id);
CREATE POLICY "admin_all_saved_professionals" ON saved_professionals FOR ALL USING (is_admin());
