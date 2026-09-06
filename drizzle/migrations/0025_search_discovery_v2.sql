-- Central de busca e descoberta v2
CREATE TABLE IF NOT EXISTS public.post_views (
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_views TO authenticated;
GRANT ALL ON public.post_views TO service_role;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own post views" ON public.post_views;
CREATE POLICY "own post views" ON public.post_views
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS post_views_user_time_idx ON public.post_views(user_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS public.user_topic_affinity (
  user_id uuid NOT NULL,
  topic text NOT NULL,
  weight double precision NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, topic)
);
GRANT SELECT ON public.user_topic_affinity TO authenticated;
GRANT ALL ON public.user_topic_affinity TO service_role;
ALTER TABLE public.user_topic_affinity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own affinity" ON public.user_topic_affinity;
CREATE POLICY "own affinity" ON public.user_topic_affinity
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.hashtag_edges (
  a_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  b_id uuid NOT NULL REFERENCES public.hashtags(id) ON DELETE CASCADE,
  weight integer NOT NULL DEFAULT 0,
  PRIMARY KEY (a_id, b_id)
);
GRANT SELECT ON public.hashtag_edges TO authenticated, anon;
GRANT ALL ON public.hashtag_edges TO service_role;
ALTER TABLE public.hashtag_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hashtag edges are public" ON public.hashtag_edges;
CREATE POLICY "hashtag edges are public" ON public.hashtag_edges FOR SELECT USING (true);

ALTER TABLE public.hashtags ADD COLUMN IF NOT EXISTS recent_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.hashtags ADD COLUMN IF NOT EXISTS growth double precision NOT NULL DEFAULT 0;
ALTER TABLE public.hashtags ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS post_hashtags_hashtag_idx ON public.post_hashtags(hashtag_id);
CREATE INDEX IF NOT EXISTS search_queries_term_time_idx ON public.search_queries(term, created_at DESC);
CREATE INDEX IF NOT EXISTS posts_created_idx ON public.posts(created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_hashtag_edges()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.hashtag_edges(a_id, b_id, weight)
  SELECT NEW.hashtag_id, ph.hashtag_id, 1
    FROM public.post_hashtags ph
   WHERE ph.post_id = NEW.post_id AND ph.hashtag_id <> NEW.hashtag_id
  ON CONFLICT (a_id, b_id) DO UPDATE SET weight = public.hashtag_edges.weight + 1;

  INSERT INTO public.hashtag_edges(a_id, b_id, weight)
  SELECT ph.hashtag_id, NEW.hashtag_id, 1
    FROM public.post_hashtags ph
   WHERE ph.post_id = NEW.post_id AND ph.hashtag_id <> NEW.hashtag_id
  ON CONFLICT (a_id, b_id) DO UPDATE SET weight = public.hashtag_edges.weight + 1;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_hashtag_edges ON public.post_hashtags;
CREATE TRIGGER trg_sync_hashtag_edges AFTER INSERT ON public.post_hashtags
  FOR EACH ROW EXECUTE FUNCTION public.sync_hashtag_edges();

INSERT INTO public.hashtag_edges(a_id, b_id, weight)
SELECT a.hashtag_id, b.hashtag_id, count(*)::int
  FROM public.post_hashtags a
  JOIN public.post_hashtags b ON b.post_id = a.post_id AND b.hashtag_id <> a.hashtag_id
 GROUP BY 1, 2
ON CONFLICT (a_id, b_id) DO UPDATE SET weight = EXCLUDED.weight;

CREATE OR REPLACE FUNCTION public.recompute_trends()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hashtags h SET
    recent_count = COALESCE(r.recent, 0),
    growth = CASE
      WHEN COALESCE(r.prev, 0) = 0 AND COALESCE(r.recent, 0) = 0 THEN 0
      WHEN COALESCE(r.prev, 0) = 0 THEN 100 * COALESCE(r.recent, 0)
      ELSE 100.0 * (COALESCE(r.recent, 0) - r.prev) / r.prev
    END
  FROM (
    SELECT ph.hashtag_id,
           count(*) FILTER (WHERE ph.created_at > now() - interval '3 days') AS recent,
           count(*) FILTER (WHERE ph.created_at <= now() - interval '3 days'
                              AND ph.created_at > now() - interval '6 days') AS prev
      FROM public.post_hashtags ph
     GROUP BY 1
  ) r
  WHERE r.hashtag_id = h.id;
END; $$;
GRANT EXECUTE ON FUNCTION public.recompute_trends() TO authenticated, service_role;
SELECT public.recompute_trends();

CREATE OR REPLACE FUNCTION public.log_post_view(_post_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL OR _post_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.post_views(user_id, post_id, viewed_at)
  VALUES (_me, _post_id, now())
  ON CONFLICT (user_id, post_id) DO UPDATE SET viewed_at = now();

  INSERT INTO public.user_topic_affinity(user_id, topic, weight, updated_at)
  SELECT _me, h.tag, 1, now()
    FROM public.post_hashtags ph JOIN public.hashtags h ON h.id = ph.hashtag_id
   WHERE ph.post_id = _post_id
  ON CONFLICT (user_id, topic) DO UPDATE
    SET weight = LEAST(50, public.user_topic_affinity.weight + 1), updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.log_post_view(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_my_affinity()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_topic_affinity(user_id, topic, weight, updated_at)
  SELECT _me, t.tag, sum(t.w), now() FROM (
    SELECT h.tag AS tag, count(*) * 3.0 AS w
      FROM public.likes l
      JOIN public.post_hashtags ph ON ph.post_id = l.post_id
      JOIN public.hashtags h ON h.id = ph.hashtag_id
     WHERE l.user_id = _me GROUP BY h.tag
    UNION ALL
    SELECT h.tag, count(*) * 2.0
      FROM public.hashtag_views hv JOIN public.hashtags h ON h.id = hv.hashtag_id
     WHERE hv.user_id = _me GROUP BY h.tag
    UNION ALL
    SELECT h.tag, count(*) * 1.0
      FROM public.follows f
      JOIN public.posts p ON p.author_id = f.following_id
      JOIN public.post_hashtags ph ON ph.post_id = p.id
      JOIN public.hashtags h ON h.id = ph.hashtag_id
     WHERE f.follower_id = _me GROUP BY h.tag
    UNION ALL
    SELECT replace(sq.term, ' ', ''), count(*) * 1.5
      FROM public.search_queries sq WHERE sq.user_id = _me GROUP BY 1
  ) t
  GROUP BY t.tag
  ON CONFLICT (user_id, topic) DO UPDATE
    SET weight = LEAST(50, EXCLUDED.weight), updated_at = now();
END; $$;
GRANT EXECUTE ON FUNCTION public.recompute_my_affinity() TO authenticated;

CREATE OR REPLACE FUNCTION public.popular_searches(_limit integer DEFAULT 10)
RETURNS TABLE(term text, display_term text, hits bigint, growth double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.term,
         (array_agg(s.display_term ORDER BY s.created_at DESC))[1],
         count(*) FILTER (WHERE s.created_at > now() - interval '7 days'),
         CASE
           WHEN count(*) FILTER (WHERE s.created_at <= now() - interval '3 days'
                                   AND s.created_at > now() - interval '6 days') = 0
             THEN 100.0 * count(*) FILTER (WHERE s.created_at > now() - interval '3 days')
           ELSE 100.0 * (count(*) FILTER (WHERE s.created_at > now() - interval '3 days')
                 - count(*) FILTER (WHERE s.created_at <= now() - interval '3 days'
                                      AND s.created_at > now() - interval '6 days'))::double precision
                / count(*) FILTER (WHERE s.created_at <= now() - interval '3 days'
                                     AND s.created_at > now() - interval '6 days')
         END
    FROM public.search_queries s
   WHERE s.created_at > now() - interval '30 days' AND length(s.term) >= 2
   GROUP BY s.term
  HAVING count(*) FILTER (WHERE s.created_at > now() - interval '7 days') > 0
   ORDER BY count(*) FILTER (WHERE s.created_at > now() - interval '7 days') DESC, max(s.created_at) DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 10), 20));
$$;
GRANT EXECUTE ON FUNCTION public.popular_searches(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.trending_topics(_limit integer DEFAULT 12)
RETURNS TABLE(kind text, label text, slug text, posts bigint, growth double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM (
    SELECT 'hashtag'::text, h.display_tag, h.tag, h.post_count::bigint, h.growth
      FROM public.hashtags h
     WHERE h.post_count > 0
     ORDER BY (h.recent_count * 5 + h.post_count)::double precision + GREATEST(0, h.growth) / 10 DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 20))
  ) t
  UNION ALL
  SELECT 'term', p.display_term, p.term, p.hits, p.growth
    FROM public.popular_searches(5) p
   WHERE p.growth IS NOT NULL AND p.growth > 0;
$$;
GRANT EXECUTE ON FUNCTION public.trending_topics(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.recommended_for_me(_limit integer DEFAULT 12)
RETURNS TABLE(kind text, label text, slug text, sublabel text, image text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _me uuid := auth.uid();
BEGIN
  IF _me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT 'hashtag'::text, h.display_tag, h.tag, h.post_count::text || ' publicações', NULL::text
    FROM public.hashtags h
   WHERE h.post_count > 0
     AND (
       h.id IN (
         SELECT e.b_id FROM public.hashtag_edges e
          JOIN public.hashtags src ON src.id = e.a_id
          JOIN public.user_topic_affinity a ON a.user_id = _me AND a.topic = src.tag
          ORDER BY e.weight * a.weight DESC LIMIT 20
       )
       OR h.tag IN (SELECT a.topic FROM public.user_topic_affinity a WHERE a.user_id = _me ORDER BY a.weight DESC LIMIT 10)
     )
   ORDER BY h.recent_count DESC, h.post_count DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 12), 20));

  RETURN QUERY
  SELECT 'user'::text, p.display_name, p.username, '@' || p.username, p.avatar_url
    FROM public.follows f1
    JOIN public.follows f2 ON f2.follower_id = f1.following_id
    JOIN public.profiles p ON p.id = f2.following_id
   WHERE f1.follower_id = _me
     AND p.id <> _me
     AND p.banned_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.follows me WHERE me.follower_id = _me AND me.following_id = p.id)
     AND NOT public.is_blocked_pair(_me, p.id)
   GROUP BY p.id, p.display_name, p.username, p.avatar_url
   ORDER BY count(*) DESC
   LIMIT 6;
END; $$;
GRANT EXECUTE ON FUNCTION public.recommended_for_me(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.related_hashtags(_tag text, _limit integer DEFAULT 8)
RETURNS TABLE(tag text, display_tag text, post_count integer, weight integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT h2.tag, h2.display_tag, h2.post_count, e.weight
    FROM public.hashtags h1
    JOIN public.hashtag_edges e ON e.a_id = h1.id
    JOIN public.hashtags h2 ON h2.id = e.b_id
   WHERE h1.tag = replace(public.normalize_search(_tag), ' ', '')
   ORDER BY e.weight DESC, h2.post_count DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 20));
$$;
GRANT EXECUTE ON FUNCTION public.related_hashtags(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_did_you_mean(_q text)
RETURNS TABLE(suggestion text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH n AS (SELECT public.normalize_search(_q) AS q)
  SELECT s.suggestion, s.kind FROM (
    SELECT h.display_tag AS suggestion, 'hashtag'::text AS kind,
           similarity(h.tag, replace((SELECT q FROM n), ' ', '')) AS sim, h.post_count AS pop
      FROM public.hashtags h
     WHERE h.tag <> replace((SELECT q FROM n), ' ', '')
       AND similarity(h.tag, replace((SELECT q FROM n), ' ', '')) > 0.45
    UNION ALL
    SELECT sq.display_term, 'term', similarity(sq.term, (SELECT q FROM n)), count(*)::int
      FROM public.search_queries sq
     WHERE sq.term <> (SELECT q FROM n) AND similarity(sq.term, (SELECT q FROM n)) > 0.5
     GROUP BY sq.display_term, sq.term
    UNION ALL
    SELECT p.display_name, 'user', similarity(public.normalize_search(p.display_name), (SELECT q FROM n)), 1
      FROM public.profiles p
     WHERE p.banned_at IS NULL
       AND similarity(public.normalize_search(COALESCE(p.display_name,'')), (SELECT q FROM n)) > 0.55
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM public.hashtags h2 WHERE h2.tag = replace((SELECT q FROM n), ' ', ''))
  ORDER BY s.sim DESC, s.pop DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.search_did_you_mean(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.related_searches(_q text, _limit integer DEFAULT 8)
RETURNS TABLE(term text, kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH n AS (SELECT public.normalize_search(_q) AS q)
  SELECT r.term, r.kind FROM (
    SELECT sq.display_term AS term, 'term'::text AS kind, count(*)::bigint AS w
      FROM public.search_queries sq
     WHERE sq.term <> (SELECT q FROM n)
       AND (sq.term LIKE '%' || (SELECT q FROM n) || '%' OR similarity(sq.term, (SELECT q FROM n)) > 0.4)
     GROUP BY sq.display_term
    UNION ALL
    SELECT '#' || h2.display_tag, 'hashtag', sum(e.weight)::bigint
      FROM public.hashtags h1
      JOIN public.hashtag_edges e ON e.a_id = h1.id
      JOIN public.hashtags h2 ON h2.id = e.b_id
     WHERE h1.tag LIKE '%' || replace((SELECT q FROM n), ' ', '') || '%'
     GROUP BY h2.display_tag
  ) r
  ORDER BY r.w DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limit, 8), 12));
$$;
GRANT EXECUTE ON FUNCTION public.related_searches(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_v2(
  _q text, _kind text DEFAULT 'all', _filter text DEFAULT 'all', _sort text DEFAULT 'relevance',
  _period text DEFAULT 'all', _place text DEFAULT NULL, _limit integer DEFAULT 20, _offset integer DEFAULT 0)
RETURNS TABLE(
  kind text, id text, title text, subtitle text, image text, media_type text, post_kind text,
  author_username text, author_display text, author_avatar text, author_verified boolean,
  author_badge text, count1 bigint, count2 bigint, views bigint, seen boolean,
  score double precision, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _n text := public.normalize_search(_q);
  _tag text := replace(public.normalize_search(_q), ' ', '');
  _lim integer := GREATEST(1, LEAST(COALESCE(_limit, 20), 40));
  _off integer := GREATEST(0, COALESCE(_offset, 0));
  _since timestamptz := CASE _period
    WHEN 'day' THEN now() - interval '1 day'
    WHEN 'week' THEN now() - interval '7 days'
    WHEN 'month' THEN now() - interval '30 days'
    ELSE '-infinity'::timestamptz END;
  _pl text := NULLIF(public.normalize_search(COALESCE(_place, '')), '');
BEGIN
  IF _n = '' THEN RETURN; END IF;
  RETURN QUERY
  WITH aff AS (SELECT a.topic, a.weight FROM public.user_topic_affinity a WHERE a.user_id = _me),
  users AS (
    SELECT 'user'::text AS kind, p.id::text AS id, p.display_name AS title,
           '@' || p.username AS subtitle, p.avatar_url AS image,
           NULL::text AS media_type, NULL::text AS post_kind,
           p.username AS author_username, p.display_name AS author_display,
           p.avatar_url AS author_avatar, p.is_verified AS author_verified,
           p.badge_variant AS author_badge,
           (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id) AS count1,
           (SELECT count(*) FROM public.posts po WHERE po.author_id = p.id) AS count2,
           0::bigint AS views, false AS seen,
           (CASE WHEN public.normalize_search(p.username) = _n OR public.normalize_search(COALESCE(p.display_name,'')) = _n THEN 100
                 WHEN public.normalize_search(p.username) LIKE _n || '%' OR public.normalize_search(COALESCE(p.display_name,'')) LIKE _n || '%' THEN 60
                 ELSE 25 END)::double precision
           + LEAST(20, (SELECT count(*) FROM public.follows f WHERE f.following_id = p.id)::double precision / 5)
           + 20 * GREATEST(similarity(public.normalize_search(p.username), _n),
                           similarity(public.normalize_search(COALESCE(p.display_name, '')), _n))
           + CASE WHEN _me IS NOT NULL AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = _me AND f.following_id = p.id) THEN 15 ELSE 0 END AS score,
           p.created_at
      FROM public.profiles p
     WHERE p.banned_at IS NULL
       AND (_me IS NULL OR NOT public.is_blocked_pair(_me, p.id))
       AND (_pl IS NULL OR public.normalize_search(COALESCE(p.location, '')) LIKE '%' || _pl || '%')
       AND (public.normalize_search(p.username) LIKE '%' || _n || '%'
            OR public.normalize_search(COALESCE(p.display_name, '')) LIKE '%' || _n || '%'
            OR similarity(public.normalize_search(COALESCE(p.display_name, '')), _n) > 0.3)
  ),
  tags AS (
    SELECT 'hashtag'::text, h.tag, '#' || h.display_tag, h.post_count::text || ' publicações',
           NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean, NULL::text,
           h.post_count::bigint, h.recent_count::bigint, 0::bigint, false,
           (CASE WHEN h.tag = _tag THEN 100 WHEN h.tag LIKE _tag || '%' THEN 65 ELSE 30 END)::double precision
           + LEAST(25, h.post_count::double precision) + LEAST(20, GREATEST(0, h.growth) / 20)
           + 20 * similarity(h.tag, _tag),
           h.created_at
      FROM public.hashtags h
     WHERE h.tag LIKE '%' || _tag || '%' OR similarity(h.tag, _tag) > 0.3
  ),
  base_posts AS (
    SELECT po.id, po.caption, po.media_url, po.thumbnail_url, po.media_type::text AS mt,
           po.post_kind, po.view_count, po.created_at, po.author_id,
           pr.username, pr.display_name, pr.avatar_url, pr.is_verified, pr.badge_variant,
           (SELECT count(*) FROM public.likes l WHERE l.post_id = po.id) AS likes,
           (SELECT count(*) FROM public.comments c WHERE c.post_id = po.id) AS comments,
           (SELECT count(*) FROM public.reposts rp WHERE rp.post_id = po.id) AS shares,
           EXISTS (SELECT 1 FROM public.post_views pv WHERE pv.post_id = po.id AND pv.user_id = _me) AS seen,
           GREATEST(
             CASE WHEN public.normalize_search(COALESCE(po.caption, '')) = _n THEN 100
                  WHEN public.normalize_search(COALESCE(po.caption, '')) LIKE _n || '%' THEN 70
                  WHEN public.normalize_search(COALESCE(po.caption, '')) LIKE '%' || _n || '%' THEN 55
                  ELSE 0 END,
             CASE WHEN EXISTS (
               SELECT 1 FROM public.post_hashtags ph JOIN public.hashtags h ON h.id = ph.hashtag_id
                WHERE ph.post_id = po.id AND (h.tag = _tag OR h.tag LIKE '%' || _tag || '%')
             ) THEN 80 ELSE 0 END,
             CASE WHEN public.normalize_search(pr.username) LIKE '%' || _n || '%'
                    OR public.normalize_search(COALESCE(pr.display_name, '')) LIKE '%' || _n || '%' THEN 40 ELSE 0 END,
             (30 * similarity(public.normalize_search(COALESCE(po.caption, '')), _n))::int
           )::double precision AS match_score,
           COALESCE((SELECT max(a.weight) FROM aff a
                      JOIN public.hashtags h2 ON h2.tag = a.topic
                      JOIN public.post_hashtags ph2 ON ph2.hashtag_id = h2.id AND ph2.post_id = po.id), 0) AS affinity
      FROM public.posts po
      JOIN public.profiles pr ON pr.id = po.author_id
     WHERE pr.banned_at IS NULL
       AND po.created_at >= _since
       AND (_me IS NULL OR NOT public.is_blocked_pair(_me, po.author_id))
       AND NOT EXISTS (SELECT 1 FROM public.hidden_posts hp WHERE hp.post_id = po.id AND hp.user_id = _me)
       AND (_pl IS NULL OR public.normalize_search(COALESCE(pr.location, '')) LIKE '%' || _pl || '%')
  ),
  posts_r AS (
    SELECT CASE WHEN bp.mt = 'video' OR bp.post_kind = 'reel' THEN 'video'
                WHEN bp.mt = 'image' THEN 'photo' ELSE 'post' END::text AS kind,
           bp.id::text, COALESCE(NULLIF(bp.caption, ''), '@' || bp.username) AS title,
           '@' || bp.username AS subtitle, COALESCE(bp.thumbnail_url, bp.media_url) AS image,
           bp.mt, bp.post_kind, bp.username, bp.display_name, bp.avatar_url,
           bp.is_verified, bp.badge_variant,
           bp.likes AS count1, bp.comments AS count2, bp.view_count::bigint AS views, bp.seen,
           bp.match_score + LEAST(25, bp.likes::double precision * 2)
             + LEAST(20, bp.comments::double precision * 3)
             + LEAST(10, bp.shares::double precision * 4)
             + LEAST(15, bp.view_count::double precision / 20)
             + LEAST(20, bp.affinity)
             + GREATEST(0, 20 - EXTRACT(epoch FROM now() - bp.created_at) / 86400) AS score,
           bp.created_at
      FROM base_posts bp
     WHERE bp.match_score > 0
  ),
  unioned AS (
    SELECT * FROM posts_r
     WHERE _kind IN ('all', 'best', 'videos', 'photos', 'posts')
       AND (_kind <> 'videos' OR posts_r.kind = 'video')
       AND (_kind <> 'photos' OR posts_r.kind = 'photo')
       AND (_kind <> 'posts' OR posts_r.kind = 'post')
       AND (_filter <> 'unseen' OR posts_r.seen = false)
       AND (_filter <> 'seen' OR posts_r.seen = true)
       AND (_filter <> 'fresh' OR posts_r.created_at > now() - interval '7 days')
    UNION ALL
    SELECT * FROM users WHERE _kind IN ('all', 'best', 'users')
    UNION ALL
    SELECT * FROM tags WHERE _kind IN ('all', 'best', 'hashtags')
  )
  SELECT u.* FROM unioned u
   ORDER BY
     CASE WHEN _sort = 'recent' THEN EXTRACT(epoch FROM u.created_at) END DESC NULLS LAST,
     CASE WHEN _sort = 'views' THEN u.views END DESC NULLS LAST,
     CASE WHEN _sort = 'likes' THEN u.count1 END DESC NULLS LAST,
     CASE WHEN _sort = 'comments' THEN u.count2 END DESC NULLS LAST,
     u.score DESC, u.created_at DESC
   LIMIT _lim OFFSET _off;
END; $$;
GRANT EXECUTE ON FUNCTION public.search_v2(text, text, text, text, text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_ask_context(_q text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  SELECT jsonb_build_object(
    'query', _q,
    'posts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'caption', left(COALESCE(r.title, ''), 300),
        'author', r.author_username, 'likes', r.count1, 'comments', r.count2, 'created_at', r.created_at))
      FROM (SELECT * FROM public.search_v2(_q, 'all', 'all', 'relevance', 'all', NULL, 12, 0)) r
      WHERE r.kind IN ('video', 'photo', 'post')), '[]'::jsonb),
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('username', r.author_username, 'name', r.title, 'followers', r.count1))
      FROM (SELECT * FROM public.search_v2(_q, 'users', 'all', 'relevance', 'all', NULL, 5, 0)) r), '[]'::jsonb),
    'hashtags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tag', r.id, 'posts', r.count1))
      FROM (SELECT * FROM public.search_v2(_q, 'hashtags', 'all', 'relevance', 'all', NULL, 6, 0)) r), '[]'::jsonb)
  ) INTO _out;
  RETURN _out;
END; $$;
GRANT EXECUTE ON FUNCTION public.search_ask_context(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_places(_q text, _limit integer DEFAULT 5)
RETURNS TABLE(place text, people bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.location, count(*)::bigint
    FROM public.profiles p
   WHERE p.banned_at IS NULL AND COALESCE(p.location, '') <> ''
     AND public.normalize_search(p.location) LIKE '%' || public.normalize_search(_q) || '%'
   GROUP BY p.location
   ORDER BY count(*) DESC
   LIMIT GREATEST(1, LEAST(COALESCE(_limit, 5), 10));
$$;
GRANT EXECUTE ON FUNCTION public.search_places(text, integer) TO authenticated;