-- Extensions for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Immutable normalizer (lowercase + strip accents)
CREATE OR REPLACE FUNCTION public.normalize_search(_t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(lower(translate(coalesce(_t,''),
    'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')));
$$;

-- ===== hashtags =====
CREATE TABLE public.hashtags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL UNIQUE,
  display_tag text NOT NULL,
  post_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hashtags TO anon, authenticated;
GRANT ALL ON public.hashtags TO service_role;
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Hashtags viewable by everyone" ON public.hashtags FOR SELECT USING (true);
CREATE INDEX idx_hashtags_tag_trgm ON public.hashtags USING gin (tag gin_trgm_ops);
CREATE INDEX idx_hashtags_count ON public.hashtags (post_count DESC);

CREATE TABLE public.post_hashtags (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, hashtag_id)
);
GRANT SELECT ON public.post_hashtags TO anon, authenticated;
GRANT ALL ON public.post_hashtags TO service_role;
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Post hashtags viewable by everyone" ON public.post_hashtags FOR SELECT USING (true);
CREATE INDEX idx_post_hashtags_tag ON public.post_hashtags (hashtag_id, created_at DESC);

-- ===== search history (private) =====
CREATE TABLE public.search_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term text NOT NULL,
  display_term text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.search_queries TO authenticated;
GRANT ALL ON public.search_queries TO service_role;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own search history" ON public.search_queries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert own search history" ON public.search_queries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own search history" ON public.search_queries FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_search_queries_user ON public.search_queries (user_id, created_at DESC);
CREATE INDEX idx_search_queries_term ON public.search_queries (term, created_at DESC);

-- ===== hashtag views (private signal) =====
CREATE TABLE public.hashtag_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hashtag_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.hashtag_views TO authenticated;
GRANT ALL ON public.hashtag_views TO service_role;
ALTER TABLE public.hashtag_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own hashtag views" ON public.hashtag_views FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert own hashtag views" ON public.hashtag_views FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_hashtag_views_user ON public.hashtag_views (user_id, created_at DESC);

-- ===== trigram indexes on searchable text =====
CREATE INDEX IF NOT EXISTS idx_posts_caption_trgm ON public.posts USING gin (public.normalize_search(caption) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm ON public.profiles USING gin (public.normalize_search(username) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_display_trgm ON public.profiles USING gin (public.normalize_search(display_name) gin_trgm_ops);

-- ===== hashtag indexing trigger =====
CREATE OR REPLACE FUNCTION public.sync_post_hashtags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  m text;
  norm text;
  hid uuid;
  found uuid[] := '{}';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.caption IS NOT DISTINCT FROM OLD.caption THEN
    RETURN NEW;
  END IF;

  FOR m IN
    SELECT DISTINCT (regexp_matches(COALESCE(NEW.caption, ''), '#([[:alnum:]_]{1,60})', 'g'))[1]
  LOOP
    norm := public.normalize_search(m);
    CONTINUE WHEN norm = '';
    INSERT INTO public.hashtags(tag, display_tag)
    VALUES (norm, m)
    ON CONFLICT (tag) DO UPDATE SET updated_at = now()
    RETURNING id INTO hid;
    found := found || hid;
    INSERT INTO public.post_hashtags(post_id, hashtag_id)
    VALUES (NEW.id, hid) ON CONFLICT DO NOTHING;
  END LOOP;

  DELETE FROM public.post_hashtags
   WHERE post_id = NEW.id AND NOT (hashtag_id = ANY(found));

  UPDATE public.hashtags h
     SET post_count = (SELECT count(*) FROM public.post_hashtags ph WHERE ph.hashtag_id = h.id),
         updated_at = now()
   WHERE h.id = ANY(found)
      OR h.id IN (SELECT hashtag_id FROM public.post_hashtags WHERE post_id = NEW.id);

  RETURN NEW;
END; $$;

CREATE TRIGGER trg_sync_post_hashtags
AFTER INSERT OR UPDATE OF caption ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.sync_post_hashtags();

CREATE OR REPLACE FUNCTION public.recount_hashtags_on_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.hashtags h
     SET post_count = GREATEST(0, h.post_count - 1)
   WHERE h.id = OLD.hashtag_id;
  RETURN OLD;
END; $$;

CREATE TRIGGER trg_recount_hashtags AFTER DELETE ON public.post_hashtags
FOR EACH ROW EXECUTE FUNCTION public.recount_hashtags_on_delete();

-- Backfill existing posts
INSERT INTO public.hashtags(tag, display_tag)
SELECT DISTINCT ON (public.normalize_search(t.m)) public.normalize_search(t.m), t.m
FROM (
  SELECT (regexp_matches(COALESCE(p.caption, ''), '#([[:alnum:]_]{1,60})', 'g'))[1] AS m
  FROM public.posts p
) t
WHERE public.normalize_search(t.m) <> ''
ON CONFLICT (tag) DO NOTHING;

INSERT INTO public.post_hashtags(post_id, hashtag_id)
SELECT DISTINCT p.id, h.id
FROM public.posts p
CROSS JOIN LATERAL (
  SELECT (regexp_matches(COALESCE(p.caption, ''), '#([[:alnum:]_]{1,60})', 'g'))[1] AS m
) t
JOIN public.hashtags h ON h.tag = public.normalize_search(t.m)
ON CONFLICT DO NOTHING;

UPDATE public.hashtags h
   SET post_count = (SELECT count(*) FROM public.post_hashtags ph WHERE ph.hashtag_id = h.id);

-- ===== search RPCs =====
CREATE OR REPLACE FUNCTION public.log_search(_term text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _me uuid := auth.uid(); _norm text := public.normalize_search(_term);
BEGIN
  IF _me IS NULL OR length(_norm) < 2 THEN RETURN; END IF;
  DELETE FROM public.search_queries WHERE user_id = _me AND term = _norm;
  INSERT INTO public.search_queries(user_id, term, display_term) VALUES (_me, _norm, btrim(_term));
  DELETE FROM public.search_queries
   WHERE user_id = _me
     AND id NOT IN (SELECT id FROM public.search_queries WHERE user_id = _me ORDER BY created_at DESC LIMIT 30);
END; $$;

CREATE OR REPLACE FUNCTION public.log_hashtag_view(_tag text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _me uuid := auth.uid(); _hid uuid;
BEGIN
  IF _me IS NULL THEN RETURN; END IF;
  SELECT id INTO _hid FROM public.hashtags WHERE tag = public.normalize_search(_tag);
  IF _hid IS NULL THEN RETURN; END IF;
  INSERT INTO public.hashtag_views(user_id, hashtag_id) VALUES (_me, _hid);
END; $$;

CREATE OR REPLACE FUNCTION public.search_all(_q text, _kind text DEFAULT 'all', _limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS TABLE(
  kind text, id text, title text, subtitle text, image text, media_type text,
  post_kind text, author_username text, author_display text, author_avatar text,
  author_verified boolean, author_badge text,
  count1 bigint, count2 bigint, score double precision, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _me uuid := auth.uid();
  _n text := public.normalize_search(_q);
  _lim integer := GREATEST(1, LEAST(COALESCE(_limit, 20), 40));
  _off integer := GREATEST(0, COALESCE(_offset, 0));
BEGIN
  IF _n = '' THEN RETURN; END IF;

  RETURN QUERY
  WITH users AS (
    SELECT 'user'::text AS kind, p.id::text AS id, p.display_name AS title,
           '@' || p.username AS subtitle, p.avatar_url AS image, NULL::text AS media_type,
           NULL::text AS post_kind, p.username AS author_username, p.display_name AS author_display,
           p.avatar_url AS author_avatar, p.is_verified AS author_verified, p.badge_variant AS author_badge,
           (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id) AS count1,
           0::bigint AS count2,
           (CASE WHEN public.normalize_search(p.username) = _n OR public.normalize_search(p.display_name) = _n THEN 100
                 WHEN public.normalize_search(p.username) LIKE _n || '%' OR public.normalize_search(p.display_name) LIKE _n || '%' THEN 60
                 ELSE 25 END)::double precision
           + LEAST(20, (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id)::double precision / 5)
           + 20 * GREATEST(similarity(public.normalize_search(p.username), _n), similarity(public.normalize_search(p.display_name), _n))
           AS score,
           p.created_at
      FROM public.profiles p
     WHERE p.banned_at IS NULL
       AND (_me IS NULL OR NOT public.is_blocked_pair(_me, p.id))
       AND (public.normalize_search(p.username) LIKE '%' || _n || '%'
            OR public.normalize_search(p.display_name) LIKE '%' || _n || '%'
            OR similarity(public.normalize_search(p.display_name), _n) > 0.3)
  ),
  tags AS (
    SELECT 'hashtag'::text, h.tag, '#' || h.display_tag, h.post_count::text || ' publicações',
           NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean, NULL::text,
           h.post_count::bigint, 0::bigint,
           (CASE WHEN h.tag = replace(_n, ' ', '') THEN 100
                 WHEN h.tag LIKE replace(_n, ' ', '') || '%' THEN 65 ELSE 30 END)::double precision
           + LEAST(25, h.post_count::double precision)
           + 20 * similarity(h.tag, replace(_n, ' ', '')),
           h.created_at
      FROM public.hashtags h
     WHERE h.tag LIKE '%' || replace(_n, ' ', '') || '%'
        OR similarity(h.tag, replace(_n, ' ', '')) > 0.3
  ),
  posts_r AS (
    SELECT (CASE WHEN po.media_type = 'video' OR po.post_kind = 'reel' THEN 'video'
                 WHEN po.media_type = 'image' THEN 'photo' ELSE 'post' END)::text,
           po.id::text, COALESCE(NULLIF(po.caption, ''), 'Publicação'), '@' || pr.username,
           COALESCE(po.thumbnail_url, po.media_url), po.media_type::text, po.post_kind,
           pr.username, pr.display_name, pr.avatar_url, pr.is_verified, pr.badge_variant,
           (SELECT count(*) FROM public.likes l WHERE l.post_id = po.id),
           po.view_count::bigint,
           (CASE WHEN public.normalize_search(po.caption) = _n THEN 90
                 WHEN public.normalize_search(po.caption) LIKE '%' || _n || '%' THEN 55
                 WHEN EXISTS (SELECT 1 FROM public.post_hashtags ph JOIN public.hashtags h2 ON h2.id = ph.hashtag_id
                               WHERE ph.post_id = po.id AND h2.tag LIKE '%' || replace(_n,' ','') || '%') THEN 50
                 ELSE 20 END)::double precision
           + LEAST(25, (SELECT count(*) FROM public.likes l WHERE l.post_id = po.id)::double precision)
           + LEAST(10, (SELECT count(*) FROM public.comments c WHERE c.post_id = po.id)::double precision)
           + LEAST(10, po.view_count::double precision / 50)
           + GREATEST(0, 15 - EXTRACT(epoch FROM (now() - po.created_at)) / 86400)
           AS score,
           po.created_at
      FROM public.posts po
      JOIN public.profiles pr ON pr.id = po.author_id
     WHERE (_me IS NULL OR NOT public.is_blocked_pair(_me, po.author_id))
       AND (_me IS NULL OR NOT EXISTS (SELECT 1 FROM public.hidden_posts hp WHERE hp.post_id = po.id AND hp.user_id = _me))
       AND (
         public.normalize_search(po.caption) LIKE '%' || _n || '%'
         OR public.normalize_search(pr.username) LIKE '%' || _n || '%'
         OR public.normalize_search(pr.display_name) LIKE '%' || _n || '%'
         OR EXISTS (SELECT 1 FROM public.post_hashtags ph JOIN public.hashtags h2 ON h2.id = ph.hashtag_id
                     WHERE ph.post_id = po.id AND h2.tag LIKE '%' || replace(_n,' ','') || '%')
         OR similarity(public.normalize_search(po.caption), _n) > 0.25
       )
  ),
  unioned AS (
    SELECT * FROM users
    UNION ALL SELECT * FROM tags
    UNION ALL SELECT * FROM posts_r
  )
  SELECT * FROM unioned u
   WHERE _kind = 'all'
      OR (_kind = 'users' AND u.kind = 'user')
      OR (_kind = 'hashtags' AND u.kind = 'hashtag')
      OR (_kind = 'videos' AND u.kind = 'video')
      OR (_kind = 'photos' AND u.kind = 'photo')
      OR (_kind = 'posts' AND u.kind IN ('post','photo','video'))
   ORDER BY u.score DESC, u.created_at DESC
   LIMIT _lim OFFSET _off;
END; $$;

CREATE OR REPLACE FUNCTION public.search_suggest(_q text)
RETURNS TABLE(kind text, label text, sublabel text, image text, score double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _me uuid := auth.uid(); _n text := public.normalize_search(_q);
BEGIN
  IF _n = '' THEN RETURN; END IF;
  RETURN QUERY
  WITH t AS (
    SELECT 'hashtag'::text AS kind, '#' || h.display_tag AS label,
           h.post_count::text || ' publicações' AS sublabel, NULL::text AS image,
           (CASE WHEN h.tag LIKE replace(_n,' ','') || '%' THEN 80 ELSE 40 END)::double precision
             + LEAST(20, h.post_count::double precision) AS score
      FROM public.hashtags h
     WHERE h.tag LIKE '%' || replace(_n,' ','') || '%'
     LIMIT 6
  ), u AS (
    SELECT 'user'::text, p.display_name, '@' || p.username, p.avatar_url,
           (CASE WHEN public.normalize_search(p.username) LIKE _n || '%' THEN 70 ELSE 35 END)::double precision
      FROM public.profiles p
     WHERE p.banned_at IS NULL
       AND (_me IS NULL OR NOT public.is_blocked_pair(_me, p.id))
       AND (public.normalize_search(p.username) LIKE '%' || _n || '%'
            OR public.normalize_search(p.display_name) LIKE '%' || _n || '%')
     LIMIT 6
  ), q AS (
    SELECT 'term'::text, max(sq.display_term), count(*)::text || ' pesquisas', NULL::text,
           (30 + LEAST(25, count(*)::double precision))::double precision
      FROM public.search_queries sq
     WHERE sq.term LIKE '%' || _n || '%' AND sq.created_at > now() - interval '30 days'
     GROUP BY sq.term
     LIMIT 5
  ), c AS (
    SELECT 'term'::text, left(regexp_replace(po.caption, '\s+', ' ', 'g'), 60), 'publicação'::text, NULL::text, 20::double precision
      FROM public.posts po
     WHERE public.normalize_search(po.caption) LIKE '%' || _n || '%' AND po.caption <> ''
     LIMIT 4
  )
  SELECT * FROM (SELECT * FROM t UNION ALL SELECT * FROM u UNION ALL SELECT * FROM q UNION ALL SELECT * FROM c) s
  ORDER BY s.score DESC LIMIT 12;
END; $$;

CREATE OR REPLACE FUNCTION public.my_search_history(_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, display_term text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT sq.id, sq.display_term, sq.created_at FROM public.search_queries sq
   WHERE sq.user_id = auth.uid()
   ORDER BY sq.created_at DESC LIMIT GREATEST(1, LEAST(COALESCE(_limit,12), 30));
$$;

CREATE OR REPLACE FUNCTION public.trending_searches(_limit integer DEFAULT 8)
RETURNS TABLE(term text, hits bigint, growth double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT max(sq.display_term) AS term,
         count(*)::bigint AS hits,
         (count(*) FILTER (WHERE sq.created_at > now() - interval '2 days'))::double precision
           / NULLIF(count(*) FILTER (WHERE sq.created_at <= now() - interval '2 days'), 0) AS growth
    FROM public.search_queries sq
   WHERE sq.created_at > now() - interval '14 days'
   GROUP BY sq.term
  HAVING count(*) >= 1
   ORDER BY (count(*) FILTER (WHERE sq.created_at > now() - interval '2 days')) DESC, count(*) DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit,8), 20));
$$;

CREATE OR REPLACE FUNCTION public.trending_hashtags(_limit integer DEFAULT 10)
RETURNS TABLE(tag text, display_tag text, post_count integer, recent bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT h.tag, h.display_tag, h.post_count,
         (SELECT count(*) FROM public.post_hashtags ph
           WHERE ph.hashtag_id = h.id AND ph.created_at > now() - interval '7 days')::bigint AS recent
    FROM public.hashtags h
   WHERE h.post_count > 0
   ORDER BY (SELECT count(*) FROM public.post_hashtags ph
              WHERE ph.hashtag_id = h.id AND ph.created_at > now() - interval '7 days') DESC,
            h.post_count DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit,10), 30));
$$;

CREATE OR REPLACE FUNCTION public.suggested_for_me(_limit integer DEFAULT 8)
RETURNS TABLE(kind text, label text, sublabel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH me AS (SELECT auth.uid() AS id),
  liked AS (
    SELECT h.tag, h.display_tag, count(*)::numeric * 3 AS w
      FROM public.likes l
      JOIN public.post_hashtags ph ON ph.post_id = l.post_id
      JOIN public.hashtags h ON h.id = ph.hashtag_id, me
     WHERE l.user_id = me.id GROUP BY h.tag, h.display_tag
  ),
  followed AS (
    SELECT h.tag, h.display_tag, count(*)::numeric * 2 AS w
      FROM public.follows f
      JOIN public.posts p ON p.author_id = f.following_id
      JOIN public.post_hashtags ph ON ph.post_id = p.id
      JOIN public.hashtags h ON h.id = ph.hashtag_id, me
     WHERE f.follower_id = me.id GROUP BY h.tag, h.display_tag
  ),
  visited AS (
    SELECT h.tag, h.display_tag, count(*)::numeric * 2 AS w
      FROM public.hashtag_views hv
      JOIN public.hashtags h ON h.id = hv.hashtag_id, me
     WHERE hv.user_id = me.id GROUP BY h.tag, h.display_tag
  ),
  all_w AS (SELECT * FROM liked UNION ALL SELECT * FROM followed UNION ALL SELECT * FROM visited)
  SELECT 'hashtag'::text, '#' || max(a.display_tag), sum(a.w)::text
    FROM all_w a GROUP BY a.tag
   ORDER BY sum(a.w) DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit,8), 20));
$$;

CREATE OR REPLACE FUNCTION public.hashtag_feed(_tag text, _sort text DEFAULT 'recent', _limit integer DEFAULT 24, _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, media_url text, thumbnail_url text, media_type text, post_kind text,
  caption text, view_count integer, likes bigint, comments bigint, created_at timestamptz,
  author_username text, author_display text, author_avatar text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _me uuid := auth.uid(); _n text := public.normalize_search(_tag);
BEGIN
  RETURN QUERY
  SELECT po.id, po.media_url, po.thumbnail_url, po.media_type::text, po.post_kind,
         po.caption, po.view_count,
         (SELECT count(*) FROM public.likes l WHERE l.post_id = po.id),
         (SELECT count(*) FROM public.comments c WHERE c.post_id = po.id),
         po.created_at, pr.username, pr.display_name, pr.avatar_url
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.author_id
    JOIN public.post_hashtags ph ON ph.post_id = po.id
    JOIN public.hashtags h ON h.id = ph.hashtag_id
   WHERE h.tag = replace(_n, ' ', '')
     AND (_me IS NULL OR NOT public.is_blocked_pair(_me, po.author_id))
   ORDER BY
     CASE WHEN _sort = 'popular' THEN
       (SELECT count(*) FROM public.likes l WHERE l.post_id = po.id) * 3
       + (SELECT count(*) FROM public.comments c WHERE c.post_id = po.id) * 2
       + po.view_count END DESC NULLS LAST,
     po.created_at DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit,24), 48)) OFFSET GREATEST(0, COALESCE(_offset,0));
END; $$;

CREATE OR REPLACE FUNCTION public.hashtag_info(_tag text)
RETURNS TABLE(tag text, display_tag text, post_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT h.tag, h.display_tag, h.post_count FROM public.hashtags h
   WHERE h.tag = replace(public.normalize_search(_tag), ' ', '');
$$;