-- Move phone numbers out of the publicly-readable profiles table into a
-- table only the owner (or an admin) can read. This is what actually
-- closes the privacy hole: RLS on `profiles` is USING(true) for SELECT,
-- so any anon visitor loading a profile page could read the raw phone
-- column today regardless of what the front-end chooses to render.

CREATE TABLE IF NOT EXISTS public.profile_private (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone text,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.profile_private (profile_id, phone)
SELECT id, phone FROM public.profiles WHERE phone IS NOT NULL AND phone <> ''
ON CONFLICT (profile_id) DO NOTHING;

ALTER TABLE public.profile_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_private_select_own_or_admin" ON public.profile_private
FOR SELECT USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles ap WHERE ap.id = auth.uid() AND ap.is_admin = true)
);

CREATE POLICY "profile_private_insert_own" ON public.profile_private
FOR INSERT WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "profile_private_update_own_or_admin" ON public.profile_private
FOR UPDATE USING (
  auth.uid() = profile_id
  OR EXISTS (SELECT 1 FROM public.profiles ap WHERE ap.id = auth.uid() AND ap.is_admin = true)
);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;
