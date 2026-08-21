-- These functions legitimately need to change credits/plan/plan_expires_at
-- on a profiles row. Mark their internal UPDATE as trusted so the new
-- protect_privileged_profile_columns trigger lets it through, instead of
-- silently reverting it like it now does for a direct client request.

CREATE OR REPLACE FUNCTION public.buy_ad_slot(dias integer, media_url text DEFAULT NULL::text, media_type text DEFAULT 'photo'::text)
 RETURNS ad_slots
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE profiles SET credits = credits - preco WHERE id = auth.uid();

  INSERT INTO ad_slots (professional_id, ends_at, credits_spent, media_url, media_type)
  VALUES (auth.uid(), NOW() + (dias || ' days')::interval, preco, media_url, media_type)
  RETURNING * INTO novo;

  RETURN novo;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_referral_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE profiles SET credits = COALESCE(credits, 0) + 10 WHERE id = NEW.referrer_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_review_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE profiles SET credits = COALESCE(credits, 0) + premio WHERE id = NEW.professional_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_manual_plans()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.trusted_profile_write', 'on', true);
  UPDATE profiles
  SET plan = 'free', plan_expires_at = NULL
  WHERE plan_expires_at IS NOT NULL
    AND plan_expires_at < NOW()
    AND stripe_subscription_id IS NULL;
END;
$function$;
