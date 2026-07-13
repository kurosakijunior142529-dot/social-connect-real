-- Remove overly-permissive read policies on private chat media buckets.
-- The stricter participant-scoped policies remain.
DROP POLICY IF EXISTS "chat_media_read_chat_audio" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_read_chat_video" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_read_chat_docs" ON storage.objects;

-- Owner-only read policy for the "chats" bucket, so users can preview
-- their own wallpaper uploads before saving.
CREATE POLICY "chats_read_own_folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chats'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Participants can read wallpaper images saved on a conversation they belong to.
CREATE POLICY "chats_read_wallpaper_participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chats'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.wallpaper_type = 'custom'
        AND c.wallpaper_value = objects.name
        AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

-- Expand allowed wallpaper types.
CREATE OR REPLACE FUNCTION public.set_conversation_wallpaper(_conversation uuid, _type text, _value text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _me UUID := auth.uid();
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _type NOT IN (
    'default','aurora','midnight','lime','rose','ocean','mono',
    'sunset','forest','cosmic','peach','graphite','paper','mesh',
    'custom'
  ) THEN
    RAISE EXCEPTION 'Invalid wallpaper';
  END IF;

  IF _type = 'custom' AND (_value IS NULL OR length(_value) = 0) THEN
    RAISE EXCEPTION 'Custom wallpaper requires a value';
  END IF;

  UPDATE public.conversations
  SET wallpaper_type = _type,
      wallpaper_value = CASE WHEN _type = 'default' THEN NULL ELSE _value END
  WHERE id = _conversation
    AND (user_a = _me OR user_b = _me);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;
END;
$function$;