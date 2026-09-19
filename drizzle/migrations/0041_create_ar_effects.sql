CREATE TABLE public.ar_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  thumbnail_url text,
  category text NOT NULL DEFAULT 'populares',
  lens_id text NOT NULL,
  lens_group_id text,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ar_effects_active_order_idx ON public.ar_effects (is_active, category, sort_order);

GRANT SELECT ON public.ar_effects TO anon;
GRANT SELECT ON public.ar_effects TO authenticated;
GRANT ALL ON public.ar_effects TO service_role;

ALTER TABLE public.ar_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active AR effects are readable"
ON public.ar_effects FOR SELECT
USING (is_active);

CREATE POLICY "Admins manage AR effects"
ON public.ar_effects FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.bump_ar_effect_usage(_effect_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ar_effects SET usage_count = usage_count + 1 WHERE id = _effect_id;
$$;

REVOKE ALL ON FUNCTION public.bump_ar_effect_usage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_ar_effect_usage(uuid) TO authenticated;