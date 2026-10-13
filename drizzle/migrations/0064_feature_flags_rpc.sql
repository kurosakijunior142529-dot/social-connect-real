DROP POLICY IF EXISTS "anyone authenticated reads flags" ON public.feature_flags;
DROP POLICY IF EXISTS "admins read flags" ON public.feature_flags;
CREATE POLICY "admins read flags" ON public.feature_flags FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS TABLE(key text, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT f.key::text, f.enabled FROM public.feature_flags f WHERE auth.uid() IS NOT NULL $$;
REVOKE ALL ON FUNCTION public.get_feature_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO authenticated;