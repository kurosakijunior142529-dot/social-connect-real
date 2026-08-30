-- Unified admin console data access. Every function verifies the admin role.
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  RETURN jsonb_build_object(
    'users', (SELECT count(*) FROM public.profiles),
    'users_new_7d', (SELECT count(*) FROM public.profiles WHERE created_at > now() - interval '7 days'),
    'banned', (SELECT count(*) FROM public.profiles WHERE banned_at IS NOT NULL),
    'suspended', (SELECT count(*) FROM public.profiles WHERE suspended_until IS NOT NULL AND suspended_until > now()),
    'posts', (SELECT count(*) FROM public.posts),
    'posts_24h', (SELECT count(*) FROM public.posts WHERE created_at > now() - interval '24 hours'),
    'videos', (SELECT count(*) FROM public.posts WHERE media_type = 'video' OR post_kind = 'reel'),
    'comments', (SELECT count(*) FROM public.comments),
    'lives_live', (SELECT count(*) FROM public.lives WHERE status = 'live'),
    'lives_total', (SELECT count(*) FROM public.lives),
    'rooms_open', (SELECT count(*) FROM public.watch_rooms WHERE closed_at IS NULL),
    'reports_pending', (SELECT count(*) FROM public.reports WHERE status = 'pending'),
    'reports_critical', (SELECT count(*) FROM public.reports WHERE severity = 'critical' AND status = 'pending'),
    'moderation_pending', (SELECT count(*) FROM public.content_moderation WHERE status = 'pending'),
    'withdrawals_pending', (SELECT count(*) FROM public.withdrawals WHERE status = 'pending'),
    'coins_circulating', (SELECT COALESCE(sum(balance), 0) FROM public.user_coins),
    'gifts_coins_30d', (SELECT COALESCE(sum(coins_spent), 0) FROM public.live_gifts WHERE created_at > now() - interval '30 days')
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_users(_search TEXT DEFAULT NULL, _filter TEXT DEFAULT 'all', _limit INTEGER DEFAULT 50)
RETURNS TABLE(
  id UUID, username TEXT, display_name TEXT, avatar_url TEXT, created_at TIMESTAMPTZ,
  strikes INTEGER, suspended_until TIMESTAMPTZ, banned_at TIMESTAMPTZ, is_minor BOOLEAN,
  is_admin BOOLEAN, posts BIGINT, followers BIGINT, coins INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.created_at,
         p.strikes, p.suspended_until, p.banned_at, p.is_minor,
         public.has_role(p.id, 'admin'),
         (SELECT count(*) FROM public.posts po WHERE po.author_id = p.id),
         (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id),
         COALESCE((SELECT uc.balance FROM public.user_coins uc WHERE uc.user_id = p.id), 0)
    FROM public.profiles p
   WHERE (_search IS NULL OR _search = ''
          OR p.username ILIKE '%' || _search || '%'
          OR p.display_name ILIKE '%' || _search || '%'
          OR p.id::text = _search)
     AND (
       _filter = 'all'
       OR (_filter = 'banned' AND p.banned_at IS NOT NULL)
       OR (_filter = 'suspended' AND p.suspended_until IS NOT NULL AND p.suspended_until > now())
       OR (_filter = 'strikes' AND p.strikes > 0)
       OR (_filter = 'new' AND p.created_at > now() - interval '7 days')
     )
   ORDER BY p.created_at DESC
   LIMIT LEAST(COALESCE(_limit, 50), 200);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_list_users(TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_content(_kind TEXT DEFAULT 'post', _search TEXT DEFAULT NULL, _limit INTEGER DEFAULT 50)
RETURNS TABLE(
  id UUID, kind TEXT, title TEXT, owner_id UUID, owner_username TEXT,
  created_at TIMESTAMPTZ, status TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _lim INTEGER := LEAST(COALESCE(_limit, 50), 200);
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;

  IF _kind = 'post' THEN
    RETURN QUERY
      SELECT p.id, 'post'::text, COALESCE(NULLIF(left(p.caption, 90), ''), '(sem legenda)'),
             p.author_id, pr.username, p.created_at, p.post_kind
        FROM public.posts p LEFT JOIN public.profiles pr ON pr.id = p.author_id
       WHERE (_search IS NULL OR _search = '' OR p.caption ILIKE '%' || _search || '%' OR pr.username ILIKE '%' || _search || '%')
       ORDER BY p.created_at DESC LIMIT _lim;
  ELSIF _kind = 'video' THEN
    RETURN QUERY
      SELECT p.id, 'video'::text, COALESCE(NULLIF(left(p.caption, 90), ''), '(sem legenda)'),
             p.author_id, pr.username, p.created_at, p.post_kind
        FROM public.posts p LEFT JOIN public.profiles pr ON pr.id = p.author_id
       WHERE (p.media_type = 'video' OR p.post_kind = 'reel')
         AND (_search IS NULL OR _search = '' OR p.caption ILIKE '%' || _search || '%' OR pr.username ILIKE '%' || _search || '%')
       ORDER BY p.created_at DESC LIMIT _lim;
  ELSIF _kind = 'comment' THEN
    RETURN QUERY
      SELECT c.id, 'comment'::text, left(COALESCE(c.content, '(figurinha)'), 90),
             c.author_id, pr.username, c.created_at, 'comment'::text
        FROM public.comments c LEFT JOIN public.profiles pr ON pr.id = c.author_id
       WHERE (_search IS NULL OR _search = '' OR c.content ILIKE '%' || _search || '%' OR pr.username ILIKE '%' || _search || '%')
       ORDER BY c.created_at DESC LIMIT _lim;
  ELSIF _kind = 'live' THEN
    RETURN QUERY
      SELECT l.id, 'live'::text, left(l.title, 90), l.host_id, pr.username, l.created_at, l.status
        FROM public.lives l LEFT JOIN public.profiles pr ON pr.id = l.host_id
       WHERE (_search IS NULL OR _search = '' OR l.title ILIKE '%' || _search || '%' OR pr.username ILIKE '%' || _search || '%')
       ORDER BY l.created_at DESC LIMIT _lim;
  ELSIF _kind = 'room' THEN
    RETURN QUERY
      SELECT r.id, 'room'::text, left(COALESCE(r.title, '(sem título)'), 90), r.host_id, pr.username, r.created_at,
             CASE WHEN r.closed_at IS NULL THEN 'aberta' ELSE 'encerrada' END
        FROM public.watch_rooms r LEFT JOIN public.profiles pr ON pr.id = r.host_id
       WHERE (_search IS NULL OR _search = '' OR r.title ILIKE '%' || _search || '%' OR pr.username ILIKE '%' || _search || '%')
       ORDER BY r.created_at DESC LIMIT _lim;
  ELSE
    RAISE EXCEPTION 'Tipo inválido';
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_list_content(TEXT, TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_content(_kind TEXT, _id UUID, _reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _owner UUID;
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) = 0 THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;

  IF _kind IN ('post','video') THEN
    SELECT author_id INTO _owner FROM public.posts WHERE id = _id;
    DELETE FROM public.posts WHERE id = _id;
  ELSIF _kind = 'comment' THEN
    SELECT author_id INTO _owner FROM public.comments WHERE id = _id;
    DELETE FROM public.comments WHERE id = _id;
  ELSIF _kind = 'live' THEN
    SELECT host_id INTO _owner FROM public.lives WHERE id = _id;
    UPDATE public.lives SET status = 'ended', ended_at = now() WHERE id = _id;
  ELSIF _kind = 'room' THEN
    SELECT host_id INTO _owner FROM public.watch_rooms WHERE id = _id;
    UPDATE public.watch_rooms SET closed_at = now() WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'Tipo inválido';
  END IF;

  INSERT INTO public.moderation_actions(user_id, action, reason, content_type, content_id, created_by)
  VALUES (COALESCE(_owner, _me), 'remove_content', left(_reason, 500), _kind, _id, _me);

  PERFORM public.log_security_event('admin_delete_content', 'warning',
    jsonb_build_object('kind', _kind, 'id', _id, 'reason', left(_reason, 200)));
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_delete_content(TEXT, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_transactions(_limit INTEGER DEFAULT 50)
RETURNS TABLE(id UUID, kind TEXT, username TEXT, coins INTEGER, amount NUMERIC, status TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _lim INTEGER := LEAST(COALESCE(_limit, 50), 200);
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Não autorizado'; END IF;
  RETURN QUERY
  SELECT * FROM (
    SELECT cp.id, 'compra'::text, pr.username, cp.coins, (cp.amount_paid::numeric / 100), 'pago'::text, cp.created_at
      FROM public.coin_purchases cp LEFT JOIN public.profiles pr ON pr.id = cp.user_id
    UNION ALL
    SELECT w.id, 'saque'::text, pr.username, w.amount_coins, w.amount_brl, w.status, w.created_at
      FROM public.withdrawals w LEFT JOIN public.profiles pr ON pr.id = w.user_id
    UNION ALL
    SELECT g.id, 'presente'::text, pr.username, g.coins_spent, NULL::numeric, 'enviado'::text, g.created_at
      FROM public.live_gifts g LEFT JOIN public.profiles pr ON pr.id = g.sender_id
  ) t ORDER BY t.created_at DESC LIMIT _lim;
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_list_transactions(INTEGER) TO authenticated;