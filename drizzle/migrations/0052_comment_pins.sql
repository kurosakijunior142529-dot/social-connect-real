ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.toggle_comment_pin(_comment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _post uuid; _pinned timestamptz;
BEGIN
  SELECT c.post_id, c.pinned_at INTO _post, _pinned FROM public.comments c WHERE c.id = _comment_id;
  IF _post IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = _post AND p.author_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF _pinned IS NOT NULL THEN
    UPDATE public.comments SET pinned_at = NULL WHERE id = _comment_id;
    RETURN false;
  END IF;
  UPDATE public.comments SET pinned_at = NULL WHERE post_id = _post AND pinned_at IS NOT NULL;
  UPDATE public.comments SET pinned_at = now() WHERE id = _comment_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.toggle_comment_pin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.toggle_comment_pin(uuid) TO authenticated;