-- ============================================================
-- PROLIGA — Migração: sistema de créditos + anúncios pagos
-- ============================================================

-- 1) PROGRAMA DE REFERÊNCIA
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credits NUMERIC DEFAULT 0;

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  candidate TEXT;
  tries INTEGER := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL THEN RETURN NEW; END IF;
  LOOP
    candidate := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    PERFORM 1 FROM profiles WHERE referral_code = candidate;
    IF NOT FOUND THEN
      NEW.referral_code := candidate;
      RETURN NEW;
    END IF;
    tries := tries + 1;
    IF tries > 10 THEN
      NEW.referral_code := upper(substr(md5(random()::text || clock_timestamp()::text || NEW.id::text), 1, 10));
      RETURN NEW;
    END IF;
  END LOOP;
END;
$function$;
CREATE TRIGGER trg_generate_referral_code BEFORE INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION generate_referral_code();

UPDATE profiles SET referral_code = upper(substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 6))
WHERE referral_code IS NULL;

CREATE TABLE IF NOT EXISTS signup_referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  referred_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (referrer_id <> referred_id)
);
ALTER TABLE signup_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signup_referrals_select_referrer" ON signup_referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "signup_referrals_select_referred" ON signup_referrals FOR SELECT USING (auth.uid() = referred_id);
CREATE POLICY "signup_referrals_insert" ON signup_referrals FOR INSERT WITH CHECK (auth.uid() = referred_id);
CREATE POLICY "admin_all_signup_referrals" ON signup_referrals FOR ALL USING (is_admin());

CREATE OR REPLACE FUNCTION grant_referral_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE profiles SET credits = COALESCE(credits, 0) + 10 WHERE id = NEW.referrer_id;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_grant_referral_credit AFTER INSERT ON signup_referrals
FOR EACH ROW EXECUTE FUNCTION grant_referral_credit();

-- 2) GANHAR CRÉDITOS COM BOAS AVALIAÇÕES
CREATE OR REPLACE FUNCTION grant_review_credit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  trabalho_real BOOLEAN;
  premio NUMERIC;
BEGIN
  IF NEW.rating < 4 THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM jobs
    WHERE professional_id = NEW.professional_id
      AND client_id = NEW.client_id
      AND status IN ('pago','concluido')
  ) INTO trabalho_real;
  IF NOT trabalho_real THEN RETURN NEW; END IF;

  premio := CASE WHEN NEW.rating = 5 THEN 10 ELSE 5 END;
  UPDATE profiles SET credits = COALESCE(credits, 0) + premio WHERE id = NEW.professional_id;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER trg_grant_review_credit AFTER INSERT ON reviews
FOR EACH ROW EXECUTE FUNCTION grant_review_credit();

-- 3) ANÚNCIOS PAGOS COM CRÉDITOS
CREATE TABLE IF NOT EXISTS ad_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  credits_spent NUMERIC NOT NULL CHECK (credits_spent > 0),
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','cancelado')),
  media_url TEXT,
  media_type TEXT DEFAULT 'photo' CHECK (media_type IN ('photo','video')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ad_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_slots_select_public" ON ad_slots FOR SELECT USING (true);
CREATE POLICY "ad_slots_insert_own" ON ad_slots FOR INSERT WITH CHECK (auth.uid() = professional_id);
CREATE POLICY "ad_slots_update_own" ON ad_slots FOR UPDATE USING (auth.uid() = professional_id);
CREATE POLICY "admin_all_ad_slots" ON ad_slots FOR ALL USING (is_admin());

CREATE OR REPLACE FUNCTION buy_ad_slot(dias INTEGER, media_url TEXT DEFAULT NULL, media_type TEXT DEFAULT 'photo')
RETURNS ad_slots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  saldo NUMERIC;
  preco NUMERIC;
  novo ad_slots;
BEGIN
  preco := CASE dias
    WHEN 3 THEN 27
    WHEN 7 THEN 60
    WHEN 14 THEN 120
    ELSE NULL
  END;
  IF preco IS NULL THEN
    RAISE EXCEPTION 'Pacote invalido. Escolhe 3, 7 ou 14 dias.';
  END IF;
  IF media_type NOT IN ('photo','video') THEN
    media_type := 'photo';
  END IF;

  SELECT credits INTO saldo FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF saldo IS NULL OR saldo < preco THEN
    RAISE EXCEPTION 'Saldo de creditos insuficiente.';
  END IF;

  UPDATE profiles SET credits = credits - preco WHERE id = auth.uid();

  INSERT INTO ad_slots (professional_id, ends_at, credits_spent, media_url, media_type)
  VALUES (auth.uid(), NOW() + (dias || ' days')::interval, preco, media_url, media_type)
  RETURNING * INTO novo;

  RETURN novo;
END;
$function$;
