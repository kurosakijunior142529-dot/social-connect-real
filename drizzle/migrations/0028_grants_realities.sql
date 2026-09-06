GRANT SELECT, INSERT, UPDATE, DELETE ON public.realities TO authenticated;
GRANT ALL ON public.realities TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_reality(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_realities(integer, integer) TO authenticated;