-- get_market_insights and get_price_suggestion exposed aggregate business
-- data (request volumes, price ranges, peak days) with no auth check at
-- all, so anonymous scraping (e.g. by competitors) was possible. Both
-- functions already personalize results using auth.uid(), so requiring a
-- session is consistent with intended use and does not change behaviour
-- for logged-in professionals.

CREATE OR REPLACE FUNCTION public.get_market_insights(p_category text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_requests_30d integer;
  v_requests_prev_30d integer;
  v_price_low numeric;
  v_price_avg numeric;
  v_price_high numeric;
  v_offers_count integer;
  v_peak_dow text;
  v_my_response numeric;
  v_cat_response numeric;
  v_my_offers_30d integer;
  v_dow_labels text[] := ARRAY['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(*) INTO v_requests_30d FROM requests
    WHERE category = p_category AND created_at >= now() - interval '30 days';

  SELECT count(*) INTO v_requests_prev_30d FROM requests
    WHERE category = p_category AND created_at >= now() - interval '60 days' AND created_at < now() - interval '30 days';

  SELECT min(ro.price_from),
         avg((coalesce(ro.price_from,ro.price_to,0)+coalesce(ro.price_to,ro.price_from,0))/2.0),
         max(ro.price_to),
         count(*)
    INTO v_price_low, v_price_avg, v_price_high, v_offers_count
    FROM request_offers ro JOIN requests r ON r.id = ro.request_id
    WHERE r.category = p_category AND ro.created_at >= now() - interval '90 days'
      AND (ro.price_from IS NOT NULL OR ro.price_to IS NOT NULL);

  SELECT v_dow_labels[extract(dow from created_at)::int + 1] INTO v_peak_dow
    FROM requests WHERE category = p_category AND created_at >= now() - interval '90 days'
    GROUP BY extract(dow from created_at) ORDER BY count(*) DESC LIMIT 1;

  SELECT avg(avg_response_minutes) INTO v_cat_response
    FROM profiles WHERE category = p_category AND response_sample_count > 0;

  SELECT avg_response_minutes INTO v_my_response FROM profiles WHERE id = auth.uid();

  SELECT count(*) INTO v_my_offers_30d FROM request_offers
    WHERE professional_id = auth.uid() AND created_at >= now() - interval '30 days';

  RETURN json_build_object(
    'requests_30d', v_requests_30d,
    'requests_prev_30d', v_requests_prev_30d,
    'price_low', v_price_low,
    'price_avg', v_price_avg,
    'price_high', v_price_high,
    'offers_sample', v_offers_count,
    'peak_dow', v_peak_dow,
    'my_response_minutes', v_my_response,
    'category_response_minutes', v_cat_response,
    'my_offers_30d', v_my_offers_30d
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_price_suggestion(p_request_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_category text;
  v_low numeric; v_avg numeric; v_high numeric; v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT category INTO v_category FROM requests WHERE id = p_request_id;
  IF v_category IS NULL THEN RETURN json_build_object('n', 0); END IF;

  SELECT min(ro.price_from),
         avg((coalesce(ro.price_from,ro.price_to,0)+coalesce(ro.price_to,ro.price_from,0))/2.0),
         max(ro.price_to),
         count(*)
    INTO v_low, v_avg, v_high, v_n
    FROM request_offers ro JOIN requests r ON r.id = ro.request_id
    WHERE r.category = v_category AND r.id <> p_request_id
      AND ro.created_at >= now() - interval '120 days'
      AND (ro.price_from IS NOT NULL OR ro.price_to IS NOT NULL);

  RETURN json_build_object('n', coalesce(v_n,0), 'low', v_low, 'avg', v_avg, 'high', v_high);
END;
$function$;
