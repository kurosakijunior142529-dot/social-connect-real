
-- ============ FIX LIKE/COMMENT NOTIFICATION TRIGGERS ============
CREATE OR REPLACE FUNCTION public.on_like_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE owner UUID;
BEGIN
  SELECT author_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  PERFORM public.notify_user(owner, NEW.user_id, 'like', 'post', NEW.post_id, '{}'::jsonb);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.on_comment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE owner UUID;
BEGIN
  SELECT author_id INTO owner FROM public.posts WHERE id = NEW.post_id;
  PERFORM public.notify_user(owner, NEW.author_id, 'comment', 'post', NEW.post_id,
    jsonb_build_object('comment_id', NEW.id, 'preview', LEFT(NEW.content, 140)));
  RETURN NEW;
END; $$;

-- ============ WATCH ROOMS ============
CREATE TABLE public.watch_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'youtube',
  video_id TEXT,
  title TEXT,
  is_private BOOLEAN NOT NULL DEFAULT true,
  invite_code TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX idx_watch_rooms_host ON public.watch_rooms(host_id);
CREATE INDEX idx_watch_rooms_invite ON public.watch_rooms(invite_code);
GRANT SELECT, INSERT, UPDATE ON public.watch_rooms TO authenticated;
GRANT ALL ON public.watch_rooms TO service_role;
ALTER TABLE public.watch_rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.watch_room_members (
  room_id UUID NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX idx_watch_members_user ON public.watch_room_members(user_id) WHERE left_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_room_members TO authenticated;
GRANT ALL ON public.watch_room_members TO service_role;
ALTER TABLE public.watch_room_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.watch_room_state (
  room_id UUID PRIMARY KEY REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  position_sec NUMERIC NOT NULL DEFAULT 0,
  playing BOOLEAN NOT NULL DEFAULT false,
  video_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE ON public.watch_room_state TO authenticated;
GRANT ALL ON public.watch_room_state TO service_role;
ALTER TABLE public.watch_room_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.watch_room_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.watch_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_watch_messages_room ON public.watch_room_messages(room_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.watch_room_messages TO authenticated;
GRANT ALL ON public.watch_room_messages TO service_role;
ALTER TABLE public.watch_room_messages ENABLE ROW LEVEL SECURITY;

-- Helper: is user a current (not-left) member of a room
CREATE OR REPLACE FUNCTION public.is_watch_member(_room UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.watch_room_members
    WHERE room_id = _room AND user_id = _user AND left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_watch_host(_room UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.watch_rooms WHERE id = _room AND host_id = _user);
$$;

-- Policies: watch_rooms
CREATE POLICY "rooms_select_members_or_public"
  ON public.watch_rooms FOR SELECT TO authenticated
  USING (
    host_id = auth.uid()
    OR is_private = false
    OR public.is_watch_member(id, auth.uid())
  );
CREATE POLICY "rooms_insert_self_host"
  ON public.watch_rooms FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid());
CREATE POLICY "rooms_update_host"
  ON public.watch_rooms FOR UPDATE TO authenticated
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- Policies: watch_room_members
CREATE POLICY "members_select_if_member"
  ON public.watch_room_members FOR SELECT TO authenticated
  USING (public.is_watch_member(room_id, auth.uid()) OR user_id = auth.uid());
CREATE POLICY "members_insert_self"
  ON public.watch_room_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "members_update_self"
  ON public.watch_room_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policies: watch_room_state
CREATE POLICY "state_select_members"
  ON public.watch_room_state FOR SELECT TO authenticated
  USING (public.is_watch_member(room_id, auth.uid()) OR public.is_watch_host(room_id, auth.uid()));
CREATE POLICY "state_insert_host"
  ON public.watch_room_state FOR INSERT TO authenticated
  WITH CHECK (public.is_watch_host(room_id, auth.uid()));
CREATE POLICY "state_update_host"
  ON public.watch_room_state FOR UPDATE TO authenticated
  USING (public.is_watch_host(room_id, auth.uid()))
  WITH CHECK (public.is_watch_host(room_id, auth.uid()));

-- Policies: watch_room_messages
CREATE POLICY "wm_select_members"
  ON public.watch_room_messages FOR SELECT TO authenticated
  USING (public.is_watch_member(room_id, auth.uid()));
CREATE POLICY "wm_insert_self_member"
  ON public.watch_room_messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_watch_member(room_id, auth.uid()));
CREATE POLICY "wm_delete_own"
  ON public.watch_room_messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- Auto-create state row when a room is created + host becomes first member
CREATE OR REPLACE FUNCTION public.on_watch_room_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.watch_room_state (room_id, video_id, updated_by)
  VALUES (NEW.id, NEW.video_id, NEW.host_id)
  ON CONFLICT (room_id) DO NOTHING;
  INSERT INTO public.watch_room_members (room_id, user_id)
  VALUES (NEW.id, NEW.host_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_watch_room_after_insert
  AFTER INSERT ON public.watch_rooms
  FOR EACH ROW EXECUTE FUNCTION public.on_watch_room_insert();

-- Close room when last active member leaves
CREATE OR REPLACE FUNCTION public.on_watch_member_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE remaining INT;
BEGIN
  IF NEW.left_at IS NOT NULL AND (OLD.left_at IS NULL) THEN
    SELECT COUNT(*) INTO remaining FROM public.watch_room_members
      WHERE room_id = NEW.room_id AND left_at IS NULL;
    IF remaining = 0 THEN
      UPDATE public.watch_rooms SET closed_at = now() WHERE id = NEW.room_id AND closed_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_watch_member_after_update
  AFTER UPDATE ON public.watch_room_members
  FOR EACH ROW EXECUTE FUNCTION public.on_watch_member_change();

CREATE TRIGGER trg_watch_rooms_updated_at
  BEFORE UPDATE ON public.watch_rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.watch_room_members;
