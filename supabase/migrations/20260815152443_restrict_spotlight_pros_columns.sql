-- Critical fix: spotlight_pros() returned SETOF profiles (every column,
-- including stripe ids, credits, is_admin, approved/suspended flags) to
-- anon/authenticated via /rest/v1/rpc/spotlight_pros. Rewrite it to return
-- only the public-facing fields the "spotlight" carousel actually needs.

DROP FUNCTION IF EXISTS public.spotlight_pros(integer);

CREATE FUNCTION public.spotlight_pros(limite integer DEFAULT 3)
RETURNS TABLE(
  id uuid,
  name text,
  bio text,
  photo_url text,
  category text,
  location text,
  website text,
  verified boolean,
  created_at timestamptz,
  cover_url text,
  slug text,
  specialties text[],
  languages text[],
  has_insurance boolean,
  experience_years integer,
  avg_response_minutes numeric,
  response_sample_count integer,
  account_type text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select p.id, p.name, p.bio, p.photo_url, p.category, p.location, p.website, p.verified,
         p.created_at, p.cover_url, p.slug, p.specialties, p.languages, p.has_insurance,
         p.experience_years, p.avg_response_minutes, p.response_sample_count, p.account_type
  from profiles p
  join plan_limits pl on pl.plan = coalesce(p.plan,'free')
  where pl.listing_boost is true
    and coalesce(p.suspended,false) is false
    and coalesce(p.is_demo,false) is false
    and p.category is not null and p.category <> ''
  order by md5(p.id::text || to_char(current_date,'YYYY-MM-DD'))
  limit greatest(limite,0)
$function$;

GRANT EXECUTE ON FUNCTION public.spotlight_pros(integer) TO anon, authenticated;
