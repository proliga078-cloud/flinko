DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS public_read_profiles ON public.profiles;

CREATE POLICY profiles_select_public_active_or_owner_or_admin ON public.profiles
FOR SELECT
USING (
  (approved IS NOT FALSE AND COALESCE(suspended, false) = false)
  OR (select auth.uid()) = user_id
  OR is_admin()
);
