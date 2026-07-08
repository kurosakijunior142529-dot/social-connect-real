
-- =========================================================
-- 1. scheduled_messages: validar membership no INSERT/UPDATE
-- =========================================================
DROP POLICY IF EXISTS "Users manage own scheduled" ON public.scheduled_messages;

CREATE POLICY "Users read own scheduled"
  ON public.scheduled_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own scheduled with membership"
  ON public.scheduled_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND (
      (target_type = 'chat' AND chat_id IS NOT NULL
        AND public.is_chat_member(chat_id, auth.uid()))
      OR
      (target_type = 'dm' AND conversation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.id = conversation_id
            AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
        ))
    )
  );

CREATE POLICY "Users update own scheduled with membership"
  ON public.scheduled_messages FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND (
      (target_type = 'chat' AND chat_id IS NOT NULL
        AND public.is_chat_member(chat_id, auth.uid()))
      OR
      (target_type = 'dm' AND conversation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.conversations c
          WHERE c.id = conversation_id
            AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
        ))
    )
  );

CREATE POLICY "Users delete own scheduled"
  ON public.scheduled_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Delivery function re-validates membership before inserting
CREATE OR REPLACE FUNCTION public.deliver_scheduled_messages()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  delivered INT := 0;
  expiry TIMESTAMPTZ;
  ok BOOLEAN;
BEGIN
  FOR r IN
    SELECT * FROM public.scheduled_messages
    WHERE sent_at IS NULL AND cancelled_at IS NULL AND send_at <= now()
    ORDER BY send_at LIMIT 200
  LOOP
    expiry := CASE WHEN r.ephemeral_seconds IS NOT NULL
      THEN now() + (r.ephemeral_seconds || ' seconds')::INTERVAL ELSE NULL END;

    ok := false;
    IF r.target_type = 'chat' AND r.chat_id IS NOT NULL THEN
      ok := public.is_chat_member(r.chat_id, r.user_id);
      IF ok THEN
        INSERT INTO public.chat_messages(chat_id, sender_id, content, expires_at)
        VALUES (r.chat_id, r.user_id, r.content, expiry);
      END IF;
    ELSIF r.target_type = 'dm' AND r.conversation_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = r.conversation_id
          AND (c.user_a = r.user_id OR c.user_b = r.user_id)
      ) INTO ok;
      IF ok THEN
        INSERT INTO public.messages(conversation_id, sender_id, content, expires_at)
        VALUES (r.conversation_id, r.user_id, r.content, expiry);
      END IF;
    END IF;

    IF ok THEN
      UPDATE public.scheduled_messages SET sent_at = now() WHERE id = r.id;
      delivered := delivered + 1;
    ELSE
      UPDATE public.scheduled_messages SET cancelled_at = now() WHERE id = r.id;
    END IF;
  END LOOP;

  DELETE FROM public.chat_messages WHERE expires_at IS NOT NULL AND expires_at <= now();
  DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at <= now();
  RETURN delivered;
END;
$function$;

-- =========================================================
-- 2. Prevent reparenting of chat_messages / messages on UPDATE
-- =========================================================
CREATE OR REPLACE FUNCTION public.prevent_chat_message_reparent()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.chat_id <> OLD.chat_id OR NEW.sender_id <> OLD.sender_id THEN
    RAISE EXCEPTION 'chat_id and sender_id are immutable';
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_prevent_chat_message_reparent ON public.chat_messages;
CREATE TRIGGER trg_prevent_chat_message_reparent
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_chat_message_reparent();

CREATE OR REPLACE FUNCTION public.prevent_dm_reparent()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.conversation_id <> OLD.conversation_id OR NEW.sender_id <> OLD.sender_id THEN
    RAISE EXCEPTION 'conversation_id and sender_id are immutable';
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trg_prevent_dm_reparent ON public.messages;
CREATE TRIGGER trg_prevent_dm_reparent
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dm_reparent();

-- =========================================================
-- 3. Storage bucket SELECT policies
-- =========================================================

-- chats: only sender or someone sharing any chat/DM with the sender
DROP POLICY IF EXISTS "auth read chats bucket" ON storage.objects;
CREATE POLICY "Chats media: uploader or shared conversation"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chats' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM public.chat_members m1
        JOIN public.chat_members m2 ON m2.chat_id = m1.chat_id
        WHERE m1.user_id = auth.uid()
          AND m2.user_id::text = (storage.foldername(name))[1]
      ) OR
      EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE (c.user_a = auth.uid() AND c.user_b::text = (storage.foldername(name))[1])
           OR (c.user_b = auth.uid() AND c.user_a::text = (storage.foldername(name))[1])
      )
    )
  );

-- stories: owner OR referenced by an active, non-blocked story
DROP POLICY IF EXISTS "auth read stories bucket" ON storage.objects;
CREATE POLICY "Stories media: owner or visible story"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'stories' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.media_url = storage.objects.name
          AND s.expires_at > now()
          AND NOT public.is_blocked_pair(auth.uid(), s.user_id)
      )
    )
  );

-- avatars: owner OR non-blocked profile owner
DROP POLICY IF EXISTS "Avatars readable by authenticated" ON storage.objects;
CREATE POLICY "Avatars media: owner or non-blocked profile"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND NOT public.is_blocked_pair(auth.uid(), p.id)
      )
    )
  );

-- covers: owner OR non-blocked profile owner
DROP POLICY IF EXISTS "auth read covers" ON storage.objects;
CREATE POLICY "Covers media: owner or non-blocked profile"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'covers' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND NOT public.is_blocked_pair(auth.uid(), p.id)
      )
    )
  );

-- posts: owner OR referenced by a non-blocked post
DROP POLICY IF EXISTS "Posts readable by authenticated" ON storage.objects;
CREATE POLICY "Posts media: owner or referenced post"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'posts' AND (
      (storage.foldername(name))[1] = auth.uid()::text OR
      EXISTS (
        SELECT 1 FROM public.posts po
        WHERE po.media_url = storage.objects.name
          AND NOT public.is_blocked_pair(auth.uid(), po.author_id)
      )
    )
  );

-- =========================================================
-- 4. Realtime authorization for call signaling
-- =========================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Call participants read signaling" ON realtime.messages;
CREATE POLICY "Call participants read signaling"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    (realtime.topic() LIKE 'call-%')
    AND EXISTS (
      SELECT 1 FROM public.calls c
      WHERE ('call-' || c.id::text) = realtime.topic()
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Call participants publish signaling" ON realtime.messages;
CREATE POLICY "Call participants publish signaling"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    (realtime.topic() LIKE 'call-%')
    AND EXISTS (
      SELECT 1 FROM public.calls c
      WHERE ('call-' || c.id::text) = realtime.topic()
        AND (c.caller_id = auth.uid() OR c.callee_id = auth.uid())
    )
  );

-- =========================================================
-- 5. Tighten SECURITY DEFINER function EXECUTE grants
-- =========================================================
-- Trigger-only functions: revoke from PUBLIC entirely (triggers run as owner)
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_chat() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_conversation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.chats_after_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_chat_invite_accepted() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_chat_invite_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_chat_message_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_comment_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_follow_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_like_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_message_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_story_reaction_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.on_story_view_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_chat_message_reparent() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_dm_reparent() FROM PUBLIC;

-- RLS helper functions: revoke from anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_chat_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_chat_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.chat_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chat_role(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_pair(uuid, uuid) TO authenticated;

-- Authenticated-callable RPC
REVOKE EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

-- Cron / admin only
REVOKE EXECUTE ON FUNCTION public.deliver_scheduled_messages() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_scheduled_messages() TO service_role;
