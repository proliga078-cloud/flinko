-- Reverte para Free automaticamente quem tem uma validade de plano manual
-- (atribuida no admin) que ja passou. Nunca mexe em quem tem
-- stripe_subscription_id (essas sao geridas pelo stripe-webhook.js, que ja
-- trata de renovacoes/cancelamentos em tempo real).
CREATE OR REPLACE FUNCTION expire_manual_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE profiles
  SET plan = 'free', plan_expires_at = NULL
  WHERE plan_expires_at IS NOT NULL
    AND plan_expires_at < NOW()
    AND stripe_subscription_id IS NULL;
END;
$function$;

SELECT cron.schedule(
  'expire-manual-plans-daily',
  '0 3 * * *',
  $$SELECT expire_manual_plans()$$
);
