CREATE TABLE IF NOT EXISTS public.call_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('offer','answer','ice','bye')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants can view call signals" ON public.call_signals;
CREATE POLICY "Participants can view call signals"
ON public.call_signals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Participants can send call signals" ON public.call_signals;
CREATE POLICY "Participants can send call signals"
ON public.call_signals
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Participants can delete own call signals" ON public.call_signals;
CREATE POLICY "Participants can delete own call signals"
ON public.call_signals
FOR DELETE
TO authenticated
USING (
  sender_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = call_signals.call_id
      AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
      AND c.ended_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_call_signals_call_created ON public.call_signals(call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_signals_sender ON public.call_signals(sender_id);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS wallpaper_type TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS wallpaper_value TEXT;

CREATE OR REPLACE FUNCTION public.set_conversation_wallpaper(
  _conversation UUID,
  _type TEXT,
  _value TEXT DEFAULT NULL
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

  IF _type NOT IN ('default','aurora','midnight','lime','rose','ocean','mono') THEN
    RAISE EXCEPTION 'Invalid wallpaper';
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
$$;

GRANT EXECUTE ON FUNCTION public.set_conversation_wallpaper(UUID, TEXT, TEXT) TO authenticated;

DROP TRIGGER IF EXISTS trg_chats_after_insert ON public.chats;
CREATE TRIGGER trg_chats_after_insert
AFTER INSERT ON public.chats
FOR EACH ROW EXECUTE FUNCTION public.chats_after_insert();

INSERT INTO public.chat_members(chat_id, user_id, role)
SELECT c.id, c.owner_id, 'owner'
FROM public.chats c
WHERE c.owner_id IS NOT NULL
ON CONFLICT DO NOTHING;

DROP TRIGGER IF EXISTS trg_watch_room_insert ON public.watch_rooms;
CREATE TRIGGER trg_watch_room_insert
AFTER INSERT ON public.watch_rooms
FOR EACH ROW EXECUTE FUNCTION public.on_watch_room_insert();

INSERT INTO public.watch_room_members(room_id, user_id, left_at)
SELECT wr.id, wr.host_id, NULL
FROM public.watch_rooms wr
WHERE wr.host_id IS NOT NULL
ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL;

INSERT INTO public.watch_room_state(room_id, video_id, updated_by)
SELECT wr.id, wr.video_id, wr.host_id
FROM public.watch_rooms wr
ON CONFLICT (room_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.on_watch_member_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Keep rooms reusable after refresh/share. Hosts can close or leave explicitly in app flows later.
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_watch_room_by_code(_code text)
RETURNS TABLE(room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _me UUID := auth.uid();
  _room UUID;
  _normalized TEXT;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _code IS NULL OR length(trim(_code)) = 0 THEN RAISE EXCEPTION 'Invalid code'; END IF;

  _normalized := trim(_code);
  IF position('code=' in _normalized) > 0 THEN
    _normalized := split_part(split_part(_normalized, 'code=', 2), '&', 1);
  END IF;

  SELECT id INTO _room FROM public.watch_rooms
   WHERE invite_code = _normalized
   LIMIT 1;

  IF _room IS NULL THEN
    RAISE EXCEPTION 'Room not found';
  END IF;

  INSERT INTO public.watch_room_members(room_id, user_id, left_at)
  VALUES (_room, _me, NULL)
  ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL;

  room_id := _room;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_watch_room_by_code(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read chat audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read chat video" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read chat docs" ON storage.objects;
DROP POLICY IF EXISTS "chat_audio_read_participants" ON storage.objects;
DROP POLICY IF EXISTS "chat_video_read_participants" ON storage.objects;
DROP POLICY IF EXISTS "chat_docs_read_participants" ON storage.objects;

CREATE POLICY "chat_audio_read_participants"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-audio'
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.media_bucket = 'chat-audio'
      AND m.media_url = storage.objects.name
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);

CREATE POLICY "chat_video_read_participants"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-video'
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.media_bucket = 'chat-video'
      AND (m.media_url = storage.objects.name OR m.poster_url = storage.objects.name)
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);

CREATE POLICY "chat_docs_read_participants"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-docs'
  AND EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.media_bucket = 'chat-docs'
      AND m.media_url = storage.objects.name
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);
