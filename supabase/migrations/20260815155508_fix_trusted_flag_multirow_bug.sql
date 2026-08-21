-- Bug found while reviewing my own fix: the trigger was clearing the
-- app.trusted_profile_write flag after the FIRST row it allowed through.
-- expire_manual_plans() can update many rows in a single UPDATE statement
-- (FOR EACH ROW fires the trigger once per row) — only the first of those
-- rows would have actually been reset to plan='free', the rest would have
-- silently kept their old (expired) plan. Since set_config's third
-- argument (true = transaction-local) already clears the flag once the
-- RPC call's implicit transaction ends, there's no need to clear it
-- manually inside the trigger — doing so only breaks multi-row updates.

CREATE OR REPLACE FUNCTION public.protect_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.trusted_profile_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_admin := false;
    NEW.approved := true;
    NEW.verified := false;
    NEW.suspended := false;
    NEW.credits := 0;
    NEW.plan := 'free';
    NEW.plan_expires_at := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.stripe_subscription_id := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.approved := OLD.approved;
    NEW.verified := OLD.verified;
    NEW.suspended := OLD.suspended;
    NEW.credits := OLD.credits;
    NEW.plan := OLD.plan;
    NEW.plan_expires_at := OLD.plan_expires_at;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  END IF;

  RETURN NEW;
END;
$function$;
