
-- ============================================
-- 1) NOTIFICATIONS
-- ============================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- like, comment, follow, message, chat_message, story_view, story_reaction, chat_invite
  entity_type TEXT,   -- post, comment, story, chat, conversation, invite
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Only triggers (SECURITY DEFINER) insert; no INSERT policy needed for clients.

-- ============================================
-- 2) STORY REACTIONS
-- ============================================
CREATE TABLE public.story_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id, emoji)
);
CREATE INDEX idx_story_reactions_story ON public.story_reactions(story_id);

GRANT SELECT, INSERT, DELETE ON public.story_reactions TO authenticated;
GRANT ALL ON public.story_reactions TO service_role;

ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions visible to owner and reactor"
  ON public.story_reactions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Users create own reactions"
  ON public.story_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own reactions"
  ON public.story_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 3) CHAT INVITES
-- ============================================
CREATE TABLE public.chat_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined, cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX uniq_pending_invite ON public.chat_invites(chat_id, invitee_id) WHERE status = 'pending';
CREATE INDEX idx_invites_invitee ON public.chat_invites(invitee_id, status);

GRANT SELECT, INSERT, UPDATE ON public.chat_invites TO authenticated;
GRANT ALL ON public.chat_invites TO service_role;

ALTER TABLE public.chat_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Invitee or inviter can read"
  ON public.chat_invites FOR SELECT TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

CREATE POLICY "Chat admins can invite"
  ON public.chat_invites FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = inviter_id
    AND public.chat_role(chat_id, auth.uid()) IN ('owner','admin')
    AND NOT public.is_chat_member(chat_id, invitee_id)
  );

CREATE POLICY "Invitee responds; inviter cancels"
  ON public.chat_invites FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

-- ============================================
-- 4) SAVED POSTS
-- ============================================
CREATE TABLE public.saved_posts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX idx_saved_posts_user ON public.saved_posts(user_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.saved_posts TO authenticated;
GRANT ALL ON public.saved_posts TO service_role;

ALTER TABLE public.saved_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own saves"
  ON public.saved_posts FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 5) TRIGGERS -> notifications
-- ============================================

-- Helper: insert notification suppressing self-notifications
CREATE OR REPLACE FUNCTION public.notify_user(
  _user UUID, _actor UUID, _type TEXT, _entity_type TEXT, _entity_id UUID, _meta JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user IS NULL OR _user = _actor THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, actor_id, type, entity_type, entity_id, metadata)
  VALUES (_user, _actor, _type, _entity_type, _entity_id, COALESCE(_meta, '{}'::jsonb));
END;$$;

-- LIKE
CREATE OR REPLACE FUNCTION public.on_like_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  PERFORM public.notify_user(owner, NEW.user_id, 'like', 'post', NEW.post_id, '{}'::jsonb);
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_like_notif AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.on_like_insert();

-- COMMENT
CREATE OR REPLACE FUNCTION public.on_comment_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID;
BEGIN
  SELECT user_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  PERFORM public.notify_user(owner, NEW.user_id, 'comment', 'post', NEW.post_id,
    jsonb_build_object('comment_id', NEW.id, 'preview', LEFT(NEW.content, 140)));
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_comment_notif AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.on_comment_insert();

-- FOLLOW
CREATE OR REPLACE FUNCTION public.on_follow_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_user(NEW.following_id, NEW.follower_id, 'follow', 'user', NEW.follower_id, '{}'::jsonb);
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_follow_notif AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.on_follow_insert();

-- DM MESSAGE
CREATE OR REPLACE FUNCTION public.on_message_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ua UUID; ub UUID; recipient UUID;
BEGIN
  SELECT user_a, user_b INTO ua, ub FROM public.conversations WHERE id = NEW.conversation_id;
  recipient := CASE WHEN NEW.sender_id = ua THEN ub ELSE ua END;
  PERFORM public.notify_user(recipient, NEW.sender_id, 'message', 'conversation', NEW.conversation_id,
    jsonb_build_object('preview', LEFT(COALESCE(NEW.content,''), 140)));
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_message_notif AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_insert();

-- CHAT MESSAGE -> notify all other members
CREATE OR REPLACE FUNCTION public.on_chat_message_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT user_id FROM public.chat_members WHERE chat_id = NEW.chat_id AND user_id <> NEW.sender_id LOOP
    PERFORM public.notify_user(m.user_id, NEW.sender_id, 'chat_message', 'chat', NEW.chat_id,
      jsonb_build_object('message_id', NEW.id, 'preview', LEFT(COALESCE(NEW.content,''), 140)));
  END LOOP;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_chat_message_notif AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_insert();

-- STORY VIEW
CREATE OR REPLACE FUNCTION public.on_story_view_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID;
BEGIN
  SELECT user_id INTO owner FROM public.stories WHERE id = NEW.story_id;
  PERFORM public.notify_user(owner, NEW.viewer_id, 'story_view', 'story', NEW.story_id, '{}'::jsonb);
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_story_view_notif AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.on_story_view_insert();

-- STORY REACTION
CREATE OR REPLACE FUNCTION public.on_story_reaction_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner UUID;
BEGIN
  SELECT user_id INTO owner FROM public.stories WHERE id = NEW.story_id;
  PERFORM public.notify_user(owner, NEW.user_id, 'story_reaction', 'story', NEW.story_id,
    jsonb_build_object('emoji', NEW.emoji));
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_story_reaction_notif AFTER INSERT ON public.story_reactions
  FOR EACH ROW EXECUTE FUNCTION public.on_story_reaction_insert();

-- CHAT INVITE
CREATE OR REPLACE FUNCTION public.on_chat_invite_insert() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.notify_user(NEW.invitee_id, NEW.inviter_id, 'chat_invite', 'invite', NEW.id,
    jsonb_build_object('chat_id', NEW.chat_id));
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_chat_invite_notif AFTER INSERT ON public.chat_invites
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_invite_insert();

-- Accepting an invite -> add member
CREATE OR REPLACE FUNCTION public.on_chat_invite_accepted() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    INSERT INTO public.chat_members(chat_id, user_id, role)
    VALUES (NEW.chat_id, NEW.invitee_id, 'member')
    ON CONFLICT DO NOTHING;
    NEW.responded_at := now();
  ELSIF NEW.status IN ('declined','cancelled') AND OLD.status = 'pending' THEN
    NEW.responded_at := now();
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_chat_invite_response BEFORE UPDATE ON public.chat_invites
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_invite_accepted();

-- ============================================
-- 6) REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_invites;
ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_posts;
