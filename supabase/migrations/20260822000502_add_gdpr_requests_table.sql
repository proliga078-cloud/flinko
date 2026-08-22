CREATE TABLE public.gdpr_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('export','delete')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  notes text,
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

CREATE INDEX gdpr_requests_profile_id_idx ON public.gdpr_requests(profile_id);
CREATE INDEX gdpr_requests_status_idx ON public.gdpr_requests(status);

ALTER TABLE public.gdpr_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY gdpr_insert_own ON public.gdpr_requests FOR INSERT
  WITH CHECK ((select auth.uid()) = profile_id);

CREATE POLICY gdpr_select_own ON public.gdpr_requests FOR SELECT
  USING ((select auth.uid()) = profile_id);

CREATE POLICY gdpr_user_cancel_own ON public.gdpr_requests FOR UPDATE
  USING ((select auth.uid()) = profile_id AND status = 'pending')
  WITH CHECK ((select auth.uid()) = profile_id AND status = 'cancelled');

CREATE POLICY gdpr_admin_select ON public.gdpr_requests FOR SELECT
  USING (is_admin());

CREATE POLICY gdpr_admin_update ON public.gdpr_requests FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

REVOKE ALL ON public.gdpr_requests FROM anon;
GRANT SELECT, INSERT ON public.gdpr_requests TO authenticated;
GRANT UPDATE (status, notes, admin_notes, resolved_at) ON public.gdpr_requests TO authenticated;
