-- Limite de serviços por plano, alinhado com o que a página de preços promete:
-- Grátis: 2 (mantém-se), Starter, Pro, Empresas e Premium (legado): sem limite.
-- Antes, o "ELSE 2" apanhava Starter e Empresas (ficavam com 2, como o Grátis) e o
-- Pro ficava com 10, apesar de o site prometer "serviços sem limite" desde o Starter.
CREATE OR REPLACE FUNCTION public.enforce_service_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prof_plan TEXT;
  svc_count INT;
  svc_max INT;
BEGIN
  SELECT plan INTO prof_plan FROM profiles WHERE id = NEW.professional_id;
  SELECT COUNT(*) INTO svc_count FROM services WHERE professional_id = NEW.professional_id;
  svc_max := CASE
    WHEN prof_plan IN ('starter', 'pro', 'empresas', 'premium') THEN 999999
    ELSE 2
  END;
  IF svc_count >= svc_max THEN
    RAISE EXCEPTION 'Limite de % serviços atingido para o plano %', svc_max, prof_plan;
  END IF;
  RETURN NEW;
END;
$function$;
