
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS pronouns text;

CREATE TABLE IF NOT EXISTS public.stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stories TO authenticated;
GRANT ALL ON public.stories TO service_role;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated reads active stories"
  ON public.stories FOR SELECT TO authenticated
  USING (expires_at > now() AND NOT public.is_blocked_pair(auth.uid(), user_id));
CREATE POLICY "Users create own stories"
  ON public.stories FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own stories"
  ON public.stories FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_stories_user_active ON public.stories(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, viewer_id)
);
GRANT SELECT, INSERT ON public.story_views TO authenticated;
GRANT ALL ON public.story_views TO service_role;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users record own views"
  ON public.story_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewer_id);
CREATE POLICY "Story owner or viewer reads"
  ON public.story_views FOR SELECT TO authenticated
  USING (
    auth.uid() = viewer_id OR
    EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('group','channel')),
  title text NOT NULL,
  description text,
  avatar_url text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT ALL ON public.chats TO service_role;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.chat_members (
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_members TO authenticated;
GRANT ALL ON public.chat_members TO service_role;
ALTER TABLE public.chat_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON public.chat_members(user_id);

CREATE OR REPLACE FUNCTION public.is_chat_member(_chat uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_members WHERE chat_id = _chat AND user_id = _user)
$$;

CREATE OR REPLACE FUNCTION public.chat_role(_chat uuid, _user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.chat_members WHERE chat_id = _chat AND user_id = _user
$$;

CREATE POLICY "Members view chat" ON public.chats FOR SELECT TO authenticated
  USING (public.is_chat_member(id, auth.uid()));
CREATE POLICY "Authenticated create chats" ON public.chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner/admin update chat" ON public.chats FOR UPDATE TO authenticated
  USING (public.chat_role(id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "Owner deletes chat" ON public.chats FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Members view membership" ON public.chat_members FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id, auth.uid()));
CREATE POLICY "Owner/admin add; user joins self" ON public.chat_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.chat_role(chat_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "Leave or admin removes" ON public.chat_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.chat_role(chat_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "Owner/admin updates role" ON public.chat_members FOR UPDATE TO authenticated
  USING (public.chat_role(chat_id, auth.uid()) IN ('owner','admin'));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id uuid NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON public.chat_messages(chat_id, created_at DESC);

CREATE POLICY "Members read chat messages" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.is_chat_member(chat_id, auth.uid()));
CREATE POLICY "Send in group; owner/admin in channel" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_chat_member(chat_id, auth.uid())
    AND (
      (SELECT type FROM public.chats WHERE id = chat_id) = 'group'
      OR public.chat_role(chat_id, auth.uid()) IN ('owner','admin')
    )
  );
CREATE POLICY "Delete own or admin" ON public.chat_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.chat_role(chat_id, auth.uid()) IN ('owner','admin'));

CREATE OR REPLACE FUNCTION public.chats_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.chat_members(chat_id, user_id, role) VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_chats_after_insert ON public.chats;
CREATE TRIGGER trg_chats_after_insert AFTER INSERT ON public.chats
  FOR EACH ROW EXECUTE FUNCTION public.chats_after_insert();

CREATE OR REPLACE FUNCTION public.bump_chat()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.chats SET last_message_at = NEW.created_at, updated_at = now() WHERE id = NEW.chat_id;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_bump_chat ON public.chat_messages;
CREATE TRIGGER trg_bump_chat AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_chat();

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
