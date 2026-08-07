ALTER TABLE public.chats ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_chat_meta(_chat uuid, _meta jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me UUID := auth.uid();
  _role TEXT;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT chat_role(_chat, _me) INTO _role;

  IF _role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only owners or admins can customize the chat';
  END IF;

  UPDATE public.chats
  SET meta = COALESCE(meta, '{}'::jsonb) || _meta
  WHERE id = _chat;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Chat not found';
  END IF;
END;
$$;

GRANT UPDATE (meta) ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;