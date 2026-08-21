-- Fotos anexadas a um pedido (opcional, ate 4 por pedido, aplicado no cliente).
ALTER TABLE requests ADD COLUMN IF NOT EXISTS photo_urls text[] DEFAULT '{}';

-- Propostas diretas de profissionais a um pedido publico. Nome "request_offers"
-- para nao colidir com a tabela "quotes" (orcamentos formais dentro de um job
-- ja aceite) nem com "referrals" (recomendacoes entre profissionais).
CREATE TABLE IF NOT EXISTS request_offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE NOT NULL,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  message TEXT,
  price_from NUMERIC,
  price_to NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, professional_id)
);
ALTER TABLE request_offers ENABLE ROW LEVEL SECURITY;

-- O profissional ve a propria proposta; o dono do pedido ve todas as
-- propostas que recebeu; o admin ve tudo.
CREATE POLICY "request_offers_select" ON request_offers FOR SELECT USING (
  auth.uid() = professional_id
  OR auth.uid() = (SELECT client_id FROM requests WHERE id = request_id)
  OR is_admin()
);
CREATE POLICY "request_offers_insert" ON request_offers FOR INSERT WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "request_offers_update" ON request_offers FOR UPDATE USING (auth.uid() = professional_id);
CREATE POLICY "request_offers_delete" ON request_offers FOR DELETE USING (auth.uid() = professional_id OR is_admin());

CREATE OR REPLACE FUNCTION touch_request_offer_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_touch_request_offer BEFORE UPDATE ON request_offers
FOR EACH ROW EXECUTE FUNCTION touch_request_offer_updated_at();
