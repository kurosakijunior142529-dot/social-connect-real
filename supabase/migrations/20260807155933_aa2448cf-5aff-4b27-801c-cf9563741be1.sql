ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_conversation_meta(
  _conversation UUID,
  _meta JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me UUID := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.conversations
  SET meta = COALESCE(meta, '{}'::jsonb) || _meta
  WHERE id = _conversation
    AND (user_a = _me OR user_b = _me);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_conversation_meta(UUID, JSONB) TO authenticated;

CREATE POLICY "Participants update own conversation meta" ON public.conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);