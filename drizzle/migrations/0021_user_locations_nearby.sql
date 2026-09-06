CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  city text,
  sharing boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own location read" ON public.user_locations;
CREATE POLICY "own location read" ON public.user_locations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own location write" ON public.user_locations;
CREATE POLICY "own location write" ON public.user_locations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own location update" ON public.user_locations;
CREATE POLICY "own location update" ON public.user_locations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own location delete" ON public.user_locations;
CREATE POLICY "own location delete" ON public.user_locations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_locations_updated_idx ON public.user_locations (updated_at DESC);

-- Upsert coarse location (rounded to ~1km for privacy) for the current user.
CREATE OR REPLACE FUNCTION public.set_my_location(_lat double precision, _lng double precision, _city text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat < -90 OR _lat > 90 OR _lng < -180 OR _lng > 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas';
  END IF;
  INSERT INTO public.user_locations(user_id, lat, lng, city, sharing, updated_at)
  VALUES (_me, round(_lat::numeric, 2)::double precision, round(_lng::numeric, 2)::double precision,
          left(NULLIF(trim(COALESCE(_city, '')), ''), 80), true, now())
  ON CONFLICT (user_id) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, city = COALESCE(EXCLUDED.city, public.user_locations.city),
        sharing = true, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.stop_sharing_location()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.user_locations WHERE user_id = auth.uid();
$$;

-- Nearby profiles for the current user. Never returns raw coordinates.
CREATE OR REPLACE FUNCTION public.nearby_users(_radius_km integer DEFAULT 50, _limit integer DEFAULT 40)
RETURNS TABLE(
  id uuid,
  username text,
  display_name text,
  avatar_url text,
  is_verified boolean,
  badge_variant text,
  city text,
  distance_km double precision,
  bearing double precision,
  i_follow boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _lat double precision;
  _lng double precision;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT ul.lat, ul.lng INTO _lat, _lng FROM public.user_locations ul WHERE ul.user_id = _me AND ul.sharing;
  IF _lat IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT pr.id,
         pr.username,
         pr.display_name,
         pr.avatar_url,
         pr.is_verified,
         pr.badge_variant,
         ul.city,
         (6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians(_lat)) * cos(radians(ul.lat)) * cos(radians(ul.lng) - radians(_lng))
            + sin(radians(_lat)) * sin(radians(ul.lat))
         )))) AS distance_km,
         degrees(atan2(
            sin(radians(ul.lng) - radians(_lng)) * cos(radians(ul.lat)),
            cos(radians(_lat)) * sin(radians(ul.lat)) - sin(radians(_lat)) * cos(radians(ul.lat)) * cos(radians(ul.lng) - radians(_lng))
         )) AS bearing,
         EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = _me AND f.following_id = pr.id) AS i_follow
  FROM public.user_locations ul
  JOIN public.profiles pr ON pr.id = ul.user_id
  WHERE ul.user_id <> _me
    AND ul.sharing
    AND ul.updated_at > now() - interval '7 days'
    AND pr.banned_at IS NULL
    AND COALESCE(pr.is_minor, false) = false
    AND NOT public.is_blocked_pair(_me, pr.id)
    AND (6371 * acos(LEAST(1, GREATEST(-1,
          cos(radians(_lat)) * cos(radians(ul.lat)) * cos(radians(ul.lng) - radians(_lng))
          + sin(radians(_lat)) * sin(radians(ul.lat))
       )))) <= GREATEST(1, LEAST(_radius_km, 500))
  ORDER BY distance_km ASC
  LIMIT GREATEST(1, LEAST(_limit, 100));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.nearby_users(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.nearby_users(integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_my_location(double precision, double precision, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_location(double precision, double precision, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.stop_sharing_location() FROM anon;
GRANT EXECUTE ON FUNCTION public.stop_sharing_location() TO authenticated;