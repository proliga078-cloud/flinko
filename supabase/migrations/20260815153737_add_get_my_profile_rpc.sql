-- Forward-looking fix (not yet wired to the client): today any signed-in
-- (authenticated) user can still SELECT every column of every OTHER
-- user's profiles row, including stripe ids/credits/is_admin, because the
-- client's own dashboard reads its own private fields straight off
-- `profiles` and we can't safely restrict that role's column grants
-- without breaking it (no code access to repoint the client).
--
-- This RPC gives the client a safe alternative: it returns the FULL row
-- but only for the caller's own profile. Once the frontend is updated to
-- call get_my_profile() instead of `select('*').eq('id', me)`, the
-- `authenticated` role's column grant on public.profiles can be narrowed
-- to the same public-safe set already applied to `anon`, closing this
-- gap completely.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select * from public.profiles where id = auth.uid()
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
