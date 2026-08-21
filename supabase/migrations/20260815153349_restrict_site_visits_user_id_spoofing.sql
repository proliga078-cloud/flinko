-- site_visits allowed inserting a row with an arbitrary user_id (not
-- necessarily the caller's own), letting anyone attribute fake visits to
-- any user. Anonymous visits (user_id null) and a logged-in visitor
-- recording their own visit (user_id = auth.uid()) remain allowed.
DROP POLICY IF EXISTS "allow insert visits" ON public.site_visits;

CREATE POLICY "allow insert visits" ON public.site_visits
FOR INSERT TO anon, authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());
