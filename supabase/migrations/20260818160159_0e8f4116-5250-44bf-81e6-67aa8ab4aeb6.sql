-- ============ ENUM EXTENSIONS ============
ALTER TYPE public.report_target ADD VALUE IF NOT EXISTS 'comment';
ALTER TYPE public.report_target ADD VALUE IF NOT EXISTS 'story';
ALTER TYPE public.report_target ADD VALUE IF NOT EXISTS 'live';
ALTER TYPE public.report_target ADD VALUE IF NOT EXISTS 'chat';
ALTER TYPE public.report_target ADD VALUE IF NOT EXISTS 'listing';

-- ============ PROFILE SAFETY FIELDS ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS is_minor BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strikes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dm_privacy TEXT NOT NULL DEFAULT 'everyone';

-- ============ REPORTS EXTENSIONS ============
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS moderator_note TEXT,
  ADD COLUMN IF NOT EXISTS resolved_by UUID,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- ============ MODERATION ACTIONS ============
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  report_id UUID,
  content_type TEXT,
  content_id UUID,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.moderation_actions TO authenticated;
GRANT ALL ON public.moderation_actions TO service_role;
ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own or admin read moderation actions" ON public.moderation_actions;
CREATE POLICY "own or admin read moderation actions" ON public.moderation_actions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ SECURITY EVENTS ============
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  event TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  ip TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON public.security_events (created_at DESC);
GRANT SELECT ON public.security_events TO authenticated;
GRANT ALL ON public.security_events TO service_role;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read security events" ON public.security_events;
CREATE POLICY "admins read security events" ON public.security_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ RATE LIMITS ============
CREATE TABLE IF NOT EXISTS public.rate_limits (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, subject, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read rate limits" ON public.rate_limits;
CREATE POLICY "admins read rate limits" ON public.rate_limits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.rate_limits TO authenticated;

-- ============ CONTENT MODERATION QUEUE ============
CREATE TABLE IF NOT EXISTS public.content_moderation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_id UUID,
  owner_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  hash TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_moderation_status_idx ON public.content_moderation (status, created_at DESC);
GRANT SELECT ON public.content_moderation TO authenticated;
GRANT ALL ON public.content_moderation TO service_role;
ALTER TABLE public.content_moderation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own or admin read moderation queue" ON public.content_moderation;
CREATE POLICY "own or admin read moderation queue" ON public.content_moderation
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ BLOCKED HASHES (illegal content matching) ============
CREATE TABLE IF NOT EXISTS public.blocked_hashes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hash TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'csam',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blocked_hashes TO authenticated;
GRANT ALL ON public.blocked_hashes TO service_role;
ALTER TABLE public.blocked_hashes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read blocked hashes" ON public.blocked_hashes;
CREATE POLICY "admins read blocked hashes" ON public.blocked_hashes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ FEATURE FLAGS / EMERGENCY SWITCHES ============
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  note TEXT,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone authenticated reads flags" ON public.feature_flags;
CREATE POLICY "anyone authenticated reads flags" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.feature_flags (key, note) VALUES
  ('uploads_enabled', 'Publicações, stories e mídia'),
  ('messaging_enabled', 'Mensagens diretas e grupos'),
  ('lives_enabled', 'Transmissões ao vivo'),
  ('signups_enabled', 'Criação de novas contas'),
  ('maintenance_mode', 'Modo de manutenção geral')
ON CONFLICT (key) DO NOTHING;

-- ============ CORE SECURITY FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.flag_enabled(_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = _key), true);
$$;

CREATE OR REPLACE FUNCTION public.account_state(_user UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p.banned_at IS NOT NULL THEN 'banned'
    WHEN p.suspended_until IS NOT NULL AND p.suspended_until > now() THEN 'suspended'
    ELSE 'ok' END
  FROM public.profiles p WHERE p.id = _user;
$$;

CREATE OR REPLACE FUNCTION public.can_interact(_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user IS NOT NULL AND COALESCE(public.account_state(_user), 'ok') = 'ok';
$$;

CREATE OR REPLACE FUNCTION public.can_publish(_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_interact(_user)
     AND public.flag_enabled('uploads_enabled')
     AND public.flag_enabled('maintenance_mode');
$$;

CREATE OR REPLACE FUNCTION public.can_message(_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_interact(_user)
     AND public.flag_enabled('messaging_enabled')
     AND public.flag_enabled('maintenance_mode');
$$;

CREATE OR REPLACE FUNCTION public.log_security_event(
  _event TEXT, _severity TEXT DEFAULT 'info', _metadata JSONB DEFAULT '{}'::jsonb,
  _ip TEXT DEFAULT NULL, _user_agent TEXT DEFAULT NULL, _user UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.security_events(user_id, event, severity, ip, user_agent, metadata)
  VALUES (COALESCE(_user, auth.uid()), left(_event, 120), COALESCE(_severity,'info'),
          left(_ip, 64), left(_user_agent, 300), COALESCE(_metadata, '{}'::jsonb));
END; $$;

-- Sliding-window-ish fixed bucket rate limiter. Returns TRUE when allowed.
CREATE OR REPLACE FUNCTION public.check_rate_limit(_scope TEXT, _limit INTEGER, _window_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me UUID := auth.uid();
  _bucket TIMESTAMPTZ;
  _count INTEGER;
BEGIN
  IF _me IS NULL THEN RETURN false; END IF;
  IF _limit <= 0 OR _window_seconds <= 0 THEN RETURN false; END IF;
  _bucket := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limits(scope, subject, window_start, count)
  VALUES (_scope, _me::text, _bucket, 1)
  ON CONFLICT (scope, subject, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO _count;

  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';

  IF _count > _limit THEN
    PERFORM public.log_security_event('rate_limit_exceeded', 'warning',
      jsonb_build_object('scope', _scope, 'count', _count, 'limit', _limit));
    RETURN false;
  END IF;
  RETURN true;
END; $$;

-- ============ REPORTING ============
CREATE OR REPLACE FUNCTION public.submit_report(
  _target_type TEXT, _target_id UUID, _category TEXT, _details TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me UUID := auth.uid();
  _sev TEXT := 'normal';
  _id UUID;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _target_type NOT IN ('user','post','message','comment','story','live','chat','listing') THEN
    RAISE EXCEPTION 'Alvo inválido';
  END IF;
  IF _category IS NULL OR length(trim(_category)) = 0 THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;
  IF NOT public.check_rate_limit('report', 20, 3600) THEN
    RAISE EXCEPTION 'Muitas denúncias em pouco tempo. Tente mais tarde.';
  END IF;

  IF _category IN ('child_exploitation','ncii','threat','illegal') THEN _sev := 'critical'; END IF;

  INSERT INTO public.reports(reporter_id, target_type, target_id, reason, category, details, severity)
  VALUES (_me, _target_type::public.report_target, _target_id, left(_category, 80), left(_category, 80),
          left(NULLIF(trim(COALESCE(_details,'')), ''), 1000), _sev)
  RETURNING id INTO _id;

  PERFORM public.log_security_event('report_submitted',
    CASE WHEN _sev = 'critical' THEN 'critical' ELSE 'info' END,
    jsonb_build_object('report_id', _id, 'target_type', _target_type, 'target_id', _target_id, 'category', _category));

  IF _sev = 'critical' AND _target_type IN ('post','story','comment') THEN
    INSERT INTO public.content_moderation(content_type, content_id, status, reason, score, labels)
    VALUES (_target_type, _target_id, 'pending', 'Denúncia crítica', 1,
            jsonb_build_object('category', _category));
  END IF;

  RETURN _id;
END; $$;

-- ============ PUNISHMENTS (progressive) ============
CREATE OR REPLACE FUNCTION public.admin_moderate(
  _user_id UUID, _action TEXT, _reason TEXT,
  _report_id UUID DEFAULT NULL, _content_type TEXT DEFAULT NULL,
  _content_id UUID DEFAULT NULL, _duration_hours INTEGER DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me UUID := auth.uid();
  _strikes INTEGER;
  _hours INTEGER;
  _expires TIMESTAMPTZ;
  _final TEXT := _action;
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF _action NOT IN ('warn','remove_content','restrict','suspend','ban','unban') THEN
    RAISE EXCEPTION 'Ação inválida';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;

  IF _action = 'unban' THEN
    UPDATE public.profiles SET banned_at = NULL, suspended_until = NULL, updated_at = now()
      WHERE id = _user_id;
  ELSE
    UPDATE public.profiles SET strikes = strikes + 1, updated_at = now()
      WHERE id = _user_id RETURNING strikes INTO _strikes;

    -- escalation by recidivism
    IF _action IN ('warn','restrict','suspend') AND COALESCE(_strikes,0) >= 5 THEN
      _final := 'ban';
    ELSIF _action = 'warn' AND COALESCE(_strikes,0) >= 3 THEN
      _final := 'suspend';
    END IF;

    IF _final = 'restrict' THEN
      _hours := COALESCE(_duration_hours, 24);
    ELSIF _final = 'suspend' THEN
      _hours := COALESCE(_duration_hours, GREATEST(24, 24 * COALESCE(_strikes,1)));
    END IF;

    IF _hours IS NOT NULL THEN
      _expires := now() + make_interval(hours => _hours);
      UPDATE public.profiles SET suspended_until = _expires WHERE id = _user_id;
    END IF;

    IF _final = 'ban' THEN
      UPDATE public.profiles SET banned_at = now() WHERE id = _user_id;
    END IF;

    IF _final = 'remove_content' AND _content_id IS NOT NULL THEN
      IF _content_type = 'post' THEN DELETE FROM public.posts WHERE id = _content_id;
      ELSIF _content_type = 'comment' THEN DELETE FROM public.comments WHERE id = _content_id;
      ELSIF _content_type = 'story' THEN DELETE FROM public.stories WHERE id = _content_id;
      END IF;
      UPDATE public.content_moderation SET status = 'removed', reviewed_by = _me, reviewed_at = now()
        WHERE content_id = _content_id;
    END IF;
  END IF;

  INSERT INTO public.moderation_actions(user_id, action, reason, report_id, content_type, content_id, expires_at, created_by)
  VALUES (_user_id, _final, left(_reason, 500), _report_id, _content_type, _content_id, _expires, _me);

  PERFORM public.notify_user(_user_id, _me, 'moderation', 'user', _user_id,
    jsonb_build_object('action', _final, 'reason', left(_reason,200), 'expires_at', _expires));

  PERFORM public.log_security_event('moderation_action', 'warning',
    jsonb_build_object('target', _user_id, 'action', _final, 'reason', left(_reason,200)));

  RETURN _final;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_report(_report_id UUID, _status TEXT, _note TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF _status NOT IN ('reviewed','dismissed','actioned') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  UPDATE public.reports
    SET status = _status::public.report_status, moderator_note = left(_note, 500),
        resolved_by = _me, resolved_at = now(), updated_at = now()
    WHERE id = _report_id;
  PERFORM public.log_security_event('report_resolved', 'info',
    jsonb_build_object('report_id', _report_id, 'status', _status));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_set_flag(_key TEXT, _enabled BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  INSERT INTO public.feature_flags(key, enabled, updated_by, updated_at)
  VALUES (_key, _enabled, _me, now())
  ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = _me, updated_at = now();
  PERFORM public.log_security_event('feature_flag_changed', 'warning',
    jsonb_build_object('key', _key, 'enabled', _enabled));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_content(_id UUID, _status TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF _status NOT IN ('approved','rejected','removed') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  UPDATE public.content_moderation
    SET status = _status, reviewed_by = _me, reviewed_at = now() WHERE id = _id;
END; $$;

-- ============ ENFORCE PUNISHMENTS / KILL SWITCHES AT RLS LEVEL ============
DROP POLICY IF EXISTS "Users create own posts" ON public.posts;
CREATE POLICY "Users create own posts" ON public.posts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.can_publish(auth.uid()));

DROP POLICY IF EXISTS "Users create own stories" ON public.stories;
CREATE POLICY "Users create own stories" ON public.stories
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_publish(auth.uid()));

DROP POLICY IF EXISTS "Users comment as self" ON public.comments;
CREATE POLICY "Users comment as self" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id AND public.can_interact(auth.uid()));

DROP POLICY IF EXISTS "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.can_message(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Send in group; owner/admin in channel" ON public.chat_messages;
CREATE POLICY "Send in group; owner/admin in channel" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_message(auth.uid())
    AND public.is_chat_member(chat_id, auth.uid())
    AND (
      (SELECT chats.type FROM public.chats WHERE chats.id = chat_messages.chat_id) = 'group'
      OR public.chat_role(chat_id, auth.uid()) = ANY (ARRAY['owner','admin'])
    )
  );

-- ============ LEAST PRIVILEGE ON NEW FUNCTIONS ============
REVOKE ALL ON FUNCTION public.log_security_event(TEXT, TEXT, JSONB, TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_report(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_moderate(UUID, TEXT, TEXT, UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_flag(TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_review_content(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.account_state(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_interact(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_publish(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_message(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_enabled(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.log_security_event(TEXT, TEXT, JSONB, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_report(TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate(UUID, TEXT, TEXT, UUID, TEXT, UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_report(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_flag(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_content(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_state(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_interact(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_publish(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_enabled(TEXT) TO authenticated;