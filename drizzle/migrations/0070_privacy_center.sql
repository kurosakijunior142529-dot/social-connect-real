CREATE TABLE public.user_privacy (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT false,
  follows_visibility text NOT NULL DEFAULT 'everyone' CHECK (follows_visibility IN ('everyone','followers','me')),
  searchable text NOT NULL DEFAULT 'everyone' CHECK (searchable IN ('everyone','followers')),
  show_in_suggestions boolean NOT NULL DEFAULT true,
  default_post_visibility text NOT NULL DEFAULT 'public' CHECK (default_post_visibility IN ('public','friends','me')),
  comments_from text NOT NULL DEFAULT 'everyone' CHECK (comments_from IN ('everyone','following','nobody')),
  mentions_from text NOT NULL DEFAULT 'everyone' CHECK (mentions_from IN ('everyone','following','nobody')),
  approve_tags boolean NOT NULL DEFAULT false,
  allow_share boolean NOT NULL DEFAULT true,
  allow_download boolean NOT NULL DEFAULT true,
  hide_like_counts boolean NOT NULL DEFAULT false,
  story_audience text NOT NULL DEFAULT 'everyone' CHECK (story_audience IN ('everyone','followers','close_friends')),
  story_replies_from text NOT NULL DEFAULT 'everyone' CHECK (story_replies_from IN ('everyone','following','nobody')),
  allow_story_share boolean NOT NULL DEFAULT true,
  hide_typing boolean NOT NULL DEFAULT false,
  hide_activity boolean NOT NULL DEFAULT false,
  messages_from text NOT NULL DEFAULT 'everyone' CHECK (messages_from IN ('everyone','following')),
  groups_from text NOT NULL DEFAULT 'everyone' CHECK (groups_from IN ('everyone','following','nobody')),
  protect_media boolean NOT NULL DEFAULT false,
  calls_from text NOT NULL DEFAULT 'everyone' CHECK (calls_from IN ('everyone','following','nobody')),
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_start time NOT NULL DEFAULT '22:00',
  dnd_end time NOT NULL DEFAULT '07:00',
  hide_offensive boolean NOT NULL DEFAULT true,
  blocked_words text[] NOT NULL DEFAULT '{}',
  sensitive_filter text NOT NULL DEFAULT 'standard' CHECK (sensitive_filter IN ('less','standard','more')),
  share_location boolean NOT NULL DEFAULT true,
  findable_by_contact boolean NOT NULL DEFAULT true,
  login_alerts boolean NOT NULL DEFAULT true,
  personalization boolean NOT NULL DEFAULT true,
  analytics boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_privacy TO authenticated;
GRANT ALL ON public.user_privacy TO service_role;
ALTER TABLE public.user_privacy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own privacy read" ON public.user_privacy FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own privacy insert" ON public.user_privacy FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own privacy update" ON public.user_privacy FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.follow_requests (
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, target_id),
  CHECK (requester_id <> target_id)
);
GRANT SELECT, INSERT, DELETE ON public.follow_requests TO authenticated;
GRANT ALL ON public.follow_requests TO service_role;
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr read" ON public.follow_requests FOR SELECT TO authenticated USING (auth.uid() IN (requester_id, target_id));
CREATE POLICY "fr insert" ON public.follow_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id AND NOT public.is_blocked_pair(requester_id, target_id));
CREATE POLICY "fr delete" ON public.follow_requests FOR DELETE TO authenticated USING (auth.uid() IN (requester_id, target_id));

CREATE TABLE public.restricted_users (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  restricted_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, restricted_id)
);
GRANT SELECT, INSERT, DELETE ON public.restricted_users TO authenticated;
GRANT ALL ON public.restricted_users TO service_role;
ALTER TABLE public.restricted_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own restricted" ON public.restricted_users FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.muted_users (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  muted_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, muted_id)
);
GRANT SELECT, INSERT, DELETE ON public.muted_users TO authenticated;
GRANT ALL ON public.muted_users TO service_role;
ALTER TABLE public.muted_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own muted" ON public.muted_users FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_from text NOT NULL DEFAULT 'everyone';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_follower(_owner uuid, _viewer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.follows WHERE follower_id = _viewer AND following_id = _owner);
$$;

CREATE OR REPLACE FUNCTION public.is_private_account(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_private FROM public.user_privacy WHERE user_id = _owner), false);
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile_content(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner = auth.uid() OR (
    NOT public.is_blocked_pair(auth.uid(), _owner)
    AND (NOT public.is_private_account(_owner) OR public.is_follower(_owner, auth.uid()))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_post(_author uuid, _visibility text, _archived timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _author = auth.uid() OR (
    _archived IS NULL
    AND public.can_view_profile_content(_author)
    AND CASE COALESCE(_visibility,'public')
      WHEN 'me' THEN false
      WHEN 'friends' THEN public.is_follower(_author, auth.uid()) AND public.is_follower(auth.uid(), _author)
      ELSE true END
  );
$$;

CREATE OR REPLACE FUNCTION public.privacy_allows(_owner uuid, _setting text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner = auth.uid() OR CASE COALESCE(_setting,'everyone')
    WHEN 'nobody' THEN false
    WHEN 'following' THEN public.is_follower(auth.uid(), _owner)
    ELSE true END;
$$;

CREATE OR REPLACE FUNCTION public.can_call_user(_callee uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.user_privacy; t time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
BEGIN
  SELECT * INTO p FROM public.user_privacy WHERE user_id = _callee;
  IF NOT FOUND THEN RETURN true; END IF;
  IF NOT public.privacy_allows(_callee, p.calls_from) THEN RETURN false; END IF;
  IF p.dnd_enabled THEN
    IF p.dnd_start <= p.dnd_end AND t >= p.dnd_start AND t < p.dnd_end THEN RETURN false; END IF;
    IF p.dnd_start > p.dnd_end AND (t >= p.dnd_start OR t < p.dnd_end) THEN RETURN false; END IF;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.can_dm_user(_target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT public.is_blocked_pair(auth.uid(), _target)
    AND NOT EXISTS (SELECT 1 FROM public.restricted_users WHERE user_id = _target AND restricted_id = auth.uid())
    AND public.privacy_allows(_target, COALESCE((SELECT messages_from FROM public.user_privacy WHERE user_id = _target),'everyone'));
$$;

CREATE OR REPLACE FUNCTION public.can_see_follows(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _owner = auth.uid() OR (
    public.can_view_profile_content(_owner) AND
    CASE COALESCE((SELECT follows_visibility FROM public.user_privacy WHERE user_id = _owner),'everyone')
      WHEN 'me' THEN false
      WHEN 'followers' THEN public.is_follower(_owner, auth.uid())
      ELSE true END);
$$;

CREATE OR REPLACE FUNCTION public.approve_follow_request(_requester uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.follow_requests WHERE requester_id = _requester AND target_id = auth.uid()) THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;
  DELETE FROM public.follow_requests WHERE requester_id = _requester AND target_id = auth.uid();
  INSERT INTO public.follows (follower_id, following_id) VALUES (_requester, auth.uid()) ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.remove_follower(_follower uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.follows WHERE follower_id = _follower AND following_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.approve_follow_request(uuid), public.remove_follower(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_follow_request(uuid), public.remove_follower(uuid), public.can_call_user(uuid), public.can_dm_user(uuid), public.is_private_account(uuid), public.can_view_profile_content(uuid) TO authenticated;

DROP POLICY "Posts viewable by signed-in users" ON public.posts;
CREATE POLICY "Posts viewable by privacy" ON public.posts FOR SELECT TO authenticated USING (public.can_view_post(author_id, visibility, archived_at));

DROP POLICY "Anyone authenticated reads active stories" ON public.stories;
CREATE POLICY "Stories viewable by privacy" ON public.stories FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR (
    expires_at > now() AND public.can_view_profile_content(user_id)
    AND (audience = 'all' OR public.is_close_friend(user_id, auth.uid()))
    AND CASE COALESCE((SELECT story_audience FROM public.user_privacy WHERE user_privacy.user_id = stories.user_id),'everyone')
      WHEN 'followers' THEN public.is_follower(stories.user_id, auth.uid())
      WHEN 'close_friends' THEN public.is_close_friend(stories.user_id, auth.uid())
      ELSE true END));

DROP POLICY "Users follow as self" ON public.follows;
CREATE POLICY "Users follow as self" ON public.follows FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = follower_id AND NOT public.is_private_account(following_id));

DROP POLICY "Follows viewable by signed-in users" ON public.follows;
CREATE POLICY "Follows viewable by privacy" ON public.follows FOR SELECT TO authenticated USING (
  auth.uid() = follower_id OR auth.uid() = following_id OR (
    NOT public.is_blocked_pair(auth.uid(), follower_id) AND NOT public.is_blocked_pair(auth.uid(), following_id)
    AND public.can_see_follows(following_id)));

DROP POLICY "Caller can create call" ON public.calls;
CREATE POLICY "Caller can create call" ON public.calls FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = caller_id AND caller_id <> callee_id AND NOT public.is_blocked_pair(caller_id, callee_id) AND public.can_call_user(callee_id));

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(_other_user uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  me UUID := auth.uid(); a UUID; b UUID; conv_id UUID; me_minor BOOLEAN; other_minor BOOLEAN;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF me = _other_user THEN RAISE EXCEPTION 'Cannot message yourself'; END IF;
  SELECT is_minor INTO me_minor FROM public.profiles WHERE id = me;
  SELECT is_minor INTO other_minor FROM public.profiles WHERE id = _other_user;
  IF other_minor IS NULL THEN RAISE EXCEPTION 'Usuário não encontrado'; END IF;
  IF COALESCE(me_minor,false) <> COALESCE(other_minor,false) THEN
    RAISE EXCEPTION 'Conversas entre adultos e contas de menores não são permitidas';
  END IF;
  IF me < _other_user THEN a := me; b := _other_user; ELSE a := _other_user; b := me; END IF;
  SELECT id INTO conv_id FROM public.conversations WHERE user_a = a AND user_b = b;
  IF conv_id IS NULL THEN
    IF NOT public.can_dm_user(_other_user) THEN
      RAISE EXCEPTION 'Essa pessoa só recebe mensagens de quem ela segue';
    END IF;
    INSERT INTO public.conversations (user_a, user_b) VALUES (a, b) RETURNING id INTO conv_id;
  END IF;
  RETURN conv_id;
END; $function$;
