-- Aplica no servidor o limite de orçamentos/mês do plano grátis, que até
-- agora só era verificado no JS do dashboard (dashboard.html:generateQuotePdf)
-- antes de um simples db.from('quotes').insert(...) — um profissional podia
-- contornar o limite trivialmente chamando a API do Supabase diretamente,
-- sem passar pela UI. Segue exatamente o mesmo padrão já usado para
-- enforce_service_limit() e enforce_portfolio_limit() (trigger BEFORE INSERT,
-- SECURITY DEFINER, search_path fixo, sem EXECUTE para PUBLIC/anon/authenticated).
--
-- Ao contrário desses dois (que têm os limites por plano escritos à mão num
-- CASE), este lê o limite da tabela plan_limits — a mesma fonte de verdade
-- que o cliente já usa para mostrar os limites (loadPlanLimits em
-- dashboard.html) — para os dois nunca poderem divergir. quotes_per_month
-- NULL em plan_limits significa "sem limite" (pro/premium); se o plano do
-- profissional não tiver linha em plan_limits, cai para o limite do plano
-- 'free' por segurança (falha fechado) em vez de deixar passar sem limite.
CREATE OR REPLACE FUNCTION public.enforce_quote_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prof_plan TEXT;
  q_max INT;
  q_count INT;
BEGIN
  SELECT plan INTO prof_plan FROM profiles WHERE id = NEW.professional_id;
  prof_plan := COALESCE(prof_plan, 'free');

  SELECT quotes_per_month INTO q_max FROM plan_limits WHERE plan = prof_plan;
  IF NOT FOUND THEN
    SELECT quotes_per_month INTO q_max FROM plan_limits WHERE plan = 'free';
  END IF;

  IF q_max IS NULL THEN
    RETURN NEW; -- plano sem limite de orçamentos, ou sem configuração disponível
  END IF;

  SELECT COUNT(*) INTO q_count
  FROM quotes
  WHERE professional_id = NEW.professional_id
    AND created_at >= date_trunc('month', now());

  IF q_count >= q_max THEN
    RAISE EXCEPTION 'Limite de % orçamentos por mês atingido para o plano %', q_max, prof_plan;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_quote_limit ON public.quotes;
CREATE TRIGGER trg_enforce_quote_limit
  BEFORE INSERT ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_quote_limit();

REVOKE EXECUTE ON FUNCTION public.enforce_quote_limit() FROM PUBLIC, anon, authenticated;
