-- CRITICAL: confirmed live that any self-registered user could set
-- is_admin=true, credits=99999, plan='premium', approved=true,
-- verified=true directly on their own INSERT/UPDATE to public.profiles,
-- because RLS only checks row ownership (auth.uid() = id), not which
-- columns are being changed. This is a one-request full admin takeover.
--
-- Fix: a BEFORE INSERT OR UPDATE trigger that resets these columns to a
-- safe value (INSERT) or their previous value (UPDATE) for any request
-- that isn't from an admin, the service_role (Netlify functions / Stripe
-- webhook), or an explicitly-trusted internal write (see the
-- app.trusted_profile_write escape hatch used by buy_ad_slot,
-- grant_referral_credit, grant_review_credit and expire_manual_plans,
-- which legitimately need to change credits/plan/plan_expires_at on
-- someone's behalf).

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
    PERFORM set_config('app.trusted_profile_write', 'off', true);
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

DROP TRIGGER IF EXISTS protect_privileged_profile_columns_trg ON public.profiles;
CREATE TRIGGER protect_privileged_profile_columns_trg
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_privileged_profile_columns();
