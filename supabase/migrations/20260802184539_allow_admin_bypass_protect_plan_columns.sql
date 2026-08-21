-- protect_plan_columns() reverte plan/stripe_customer_id/stripe_subscription_id
-- para o valor antigo sempre que quem faz o UPDATE nao e o service_role
-- (para impedir um profissional de se auto-promover a Pro sem pagar).
-- Isso estava tambem a bloquear silenciosamente as alteracoes feitas pelo
-- proprio admin no painel /admin.html (sem erro -- o UPDATE "tinha sucesso"
-- mas o valor voltava sempre ao antigo). Corrige para deixar passar tambem
-- quando quem esta autenticado e admin (is_admin()).
CREATE OR REPLACE FUNCTION public.protect_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT is_admin() THEN
    NEW.plan := OLD.plan;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  END IF;
  RETURN NEW;
END;
$function$;
