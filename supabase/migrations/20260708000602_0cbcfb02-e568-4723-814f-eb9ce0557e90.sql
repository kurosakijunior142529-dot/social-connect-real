
-- ============================================
-- Extensão de chat_messages
-- ============================================
ALTER TABLE public.chat_messages
  ADD COLUMN reply_to UUID REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ;

CREATE INDEX idx_chat_msg_expires ON public.chat_messages(expires_at) WHERE expires_at IS NOT NULL;

-- Update policy so senders can edit their own messages
CREATE POLICY "Sender edits own chat msg"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid());

-- ============================================
-- Extensão de messages (DM)
-- ============================================
ALTER TABLE public.messages
  ADD COLUMN reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN edited_at TIMESTAMPTZ,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN expires_at TIMESTAMPTZ;

CREATE INDEX idx_msg_expires ON public.messages(expires_at) WHERE expires_at IS NOT NULL;

-- Add DELETE policy (missing today)
CREATE POLICY "Delete own DM"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- Allow sender to edit own DM (existing UPDATE policy is for recipients marking read)
CREATE POLICY "Sender edits own DM"
  ON public.messages FOR UPDATE TO authenticated
  USING (sender_id = auth.uid());

-- ============================================
-- Histórico de edições
-- ============================================
CREATE TABLE public.message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL, -- 'chat' or 'dm'
  message_id UUID NOT NULL,
  previous_content TEXT,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  editor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE INDEX idx_msg_edits ON public.message_edits(source, message_id, edited_at DESC);

GRANT SELECT, INSERT ON public.message_edits TO authenticated;
GRANT ALL ON public.message_edits TO service_role;

ALTER TABLE public.message_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editor or member reads edits"
  ON public.message_edits FOR SELECT TO authenticated
  USING (
    editor_id = auth.uid()
    OR (
      source = 'chat' AND EXISTS (
        SELECT 1 FROM public.chat_messages m
        WHERE m.id = message_id AND public.is_chat_member(m.chat_id, auth.uid())
      )
    )
    OR (
      source = 'dm' AND EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE m.id = message_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
      )
    )
  );

CREATE POLICY "Author records own edits"
  ON public.message_edits FOR INSERT TO authenticated
  WITH CHECK (editor_id = auth.uid());

-- ============================================
-- Reações
-- ============================================
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX idx_msg_reactions ON public.message_reactions(message_id);
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read reactions"
  ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND public.is_chat_member(m.chat_id, auth.uid())));
CREATE POLICY "Members react"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND public.is_chat_member(m.chat_id, auth.uid())));
CREATE POLICY "Remove own reaction"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.dm_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX idx_dm_reactions ON public.dm_message_reactions(message_id);
GRANT SELECT, INSERT, DELETE ON public.dm_message_reactions TO authenticated;
GRANT ALL ON public.dm_message_reactions TO service_role;
ALTER TABLE public.dm_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DM parts read reactions"
  ON public.dm_message_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = message_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ));
CREATE POLICY "DM parts react"
  ON public.dm_message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.id = message_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  ));
CREATE POLICY "DM remove own reaction"
  ON public.dm_message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================
-- Agendadas
-- ============================================
CREATE TABLE public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL, -- 'chat' or 'dm'
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  ephemeral_seconds INT,
  send_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sched_due ON public.scheduled_messages(send_at) WHERE sent_at IS NULL AND cancelled_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scheduled"
  ON public.scheduled_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cron: deliver every minute via SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.deliver_scheduled_messages()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; delivered INT := 0; expiry TIMESTAMPTZ;
BEGIN
  FOR r IN
    SELECT * FROM public.scheduled_messages
    WHERE sent_at IS NULL AND cancelled_at IS NULL AND send_at <= now()
    ORDER BY send_at LIMIT 200
  LOOP
    expiry := CASE WHEN r.ephemeral_seconds IS NOT NULL THEN now() + (r.ephemeral_seconds || ' seconds')::INTERVAL ELSE NULL END;
    IF r.target_type = 'chat' AND r.chat_id IS NOT NULL THEN
      INSERT INTO public.chat_messages(chat_id, sender_id, content, expires_at)
      VALUES (r.chat_id, r.user_id, r.content, expiry);
    ELSIF r.target_type = 'dm' AND r.conversation_id IS NOT NULL THEN
      INSERT INTO public.messages(conversation_id, sender_id, content, expires_at)
      VALUES (r.conversation_id, r.user_id, r.content, expiry);
    END IF;
    UPDATE public.scheduled_messages SET sent_at = now() WHERE id = r.id;
    delivered := delivered + 1;
  END LOOP;
  -- purge expired ephemerals
  DELETE FROM public.chat_messages WHERE expires_at IS NOT NULL AND expires_at <= now();
  DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at <= now();
  RETURN delivered;
END;$$;

-- Schedule with pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('deliver-scheduled-messages', '* * * * *', $$SELECT public.deliver_scheduled_messages();$$);

-- ============================================
-- Mute
-- ============================================
CREATE TABLE public.muted_conversations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  until TIMESTAMPTZ,
  PRIMARY KEY (user_id, conversation_id)
);
GRANT SELECT, INSERT, DELETE ON public.muted_conversations TO authenticated;
GRANT ALL ON public.muted_conversations TO service_role;
ALTER TABLE public.muted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own mutes DM" ON public.muted_conversations FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.muted_chats (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  until TIMESTAMPTZ,
  PRIMARY KEY (user_id, chat_id)
);
GRANT SELECT, INSERT, DELETE ON public.muted_chats TO authenticated;
GRANT ALL ON public.muted_chats TO service_role;
ALTER TABLE public.muted_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own mutes chat" ON public.muted_chats FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.muted_stories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, target_user_id)
);
GRANT SELECT, INSERT, DELETE ON public.muted_stories TO authenticated;
GRANT ALL ON public.muted_stories TO service_role;
ALTER TABLE public.muted_stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own mutes story" ON public.muted_stories FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================
-- Privacy prefs on profiles
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_online BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS read_receipts BOOLEAN NOT NULL DEFAULT true;

-- ============================================
-- Realtime
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;
