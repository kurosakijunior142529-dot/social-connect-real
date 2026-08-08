CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT ALL ON public.comment_likes TO service_role;

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_likes_select" ON public.comment_likes FOR SELECT TO authenticated USING (true);
CREATE POLICY "comment_likes_insert" ON public.comment_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comment_likes_delete" ON public.comment_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON public.comment_likes(comment_id);

-- Remove message-related notifications
DROP TRIGGER IF EXISTS trg_message_notif ON public.messages;
DROP TRIGGER IF EXISTS trg_chat_message_notif ON public.chat_messages;
DROP FUNCTION IF EXISTS public.on_message_insert();
DROP FUNCTION IF EXISTS public.on_chat_message_insert();
DELETE FROM public.notifications WHERE type IN ('message','chat_message');