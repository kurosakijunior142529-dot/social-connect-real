-- 1) Profile extras: interests + favorite track
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS favorite_track TEXT;

GRANT SELECT (interests, favorite_track) ON public.profiles TO anon, authenticated;
GRANT UPDATE (interests, favorite_track) ON public.profiles TO authenticated;

-- 2) Achievement catalog
CREATE TABLE IF NOT EXISTS public.achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏆',
  metric TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 1,
  points INTEGER NOT NULL DEFAULT 10,
  tier TEXT NOT NULL DEFAULT 'bronze',
  position INTEGER NOT NULL DEFAULT 0
);

GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "achievements readable" ON public.achievements FOR SELECT USING (true);

INSERT INTO public.achievements (id, name, description, emoji, metric, threshold, points, tier, position) VALUES
  ('first_post','Primeira vibe','Publicou seu primeiro conteúdo','🌱','posts',1,10,'bronze',1),
  ('posts_10','Criador ativo','10 publicações','✍️','posts',10,25,'prata',2),
  ('posts_50','Máquina de conteúdo','50 publicações','🚀','posts',50,60,'ouro',3),
  ('first_video','Luz, câmera','Publicou seu primeiro vídeo','🎬','videos',1,15,'bronze',4),
  ('videos_20','Diretor','20 vídeos publicados','🎥','videos',20,50,'ouro',5),
  ('first_live','No ar','Fez sua primeira live','📡','lives',1,20,'bronze',6),
  ('lives_10','Apresentador','10 lives realizadas','🎙️','lives',10,60,'ouro',7),
  ('first_room','Anfitrião','Criou sua primeira sala','🏠','rooms',1,15,'bronze',8),
  ('followers_100','Comunidade','100 seguidores','👥','followers',100,50,'prata',9),
  ('followers_1000','Ídolo','1000 seguidores','🌟','followers',1000,150,'ouro',10),
  ('likes_100','Querido','100 curtidas recebidas','❤️','likes_received',100,40,'prata',11),
  ('likes_1000','Fenômeno','1000 curtidas recebidas','🔥','likes_received',1000,120,'ouro',12),
  ('comments_50','Conversador','50 comentários feitos','💬','comments',50,30,'prata',13),
  ('gift_sender','Generoso','Enviou um presente','🎁','gifts_sent',1,20,'bronze',14),
  ('gift_star','Estrela dos presentes','Recebeu 10 presentes','💎','gifts_received',10,70,'ouro',15)
ON CONFLICT (id) DO NOTHING;

-- 3) Unlocked achievements per user
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

GRANT SELECT ON public.user_achievements TO anon, authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user achievements readable" ON public.user_achievements FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON public.user_achievements(user_id);

-- 4) Progress computation (public, read-only)
CREATE OR REPLACE FUNCTION public.achievement_progress(_user UUID)
RETURNS TABLE(metric TEXT, value BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'posts', (SELECT count(*) FROM public.posts WHERE author_id = _user)
  UNION ALL SELECT 'videos', (SELECT count(*) FROM public.posts WHERE author_id = _user AND (media_type = 'video' OR post_kind = 'reel'))
  UNION ALL SELECT 'lives', (SELECT count(*) FROM public.lives WHERE host_id = _user)
  UNION ALL SELECT 'rooms', (SELECT count(*) FROM public.watch_rooms WHERE host_id = _user)
  UNION ALL SELECT 'followers', (SELECT count(*) FROM public.follows WHERE following_id = _user)
  UNION ALL SELECT 'likes_received', (SELECT count(*) FROM public.likes l JOIN public.posts p ON p.id = l.post_id WHERE p.author_id = _user)
  UNION ALL SELECT 'comments', (SELECT count(*) FROM public.comments WHERE author_id = _user)
  UNION ALL SELECT 'gifts_sent', (SELECT count(*) FROM public.live_gifts WHERE sender_id = _user)
  UNION ALL SELECT 'gifts_received', (SELECT count(*) FROM public.live_gifts WHERE recipient_id = _user);
$$;

GRANT EXECUTE ON FUNCTION public.achievement_progress(UUID) TO anon, authenticated;

-- 5) Sync: unlocks everything the user already earned. Idempotent.
CREATE OR REPLACE FUNCTION public.sync_achievements(_user UUID DEFAULT NULL)
RETURNS TABLE(unlocked INTEGER, points INTEGER, level INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _target UUID := COALESCE(_user, auth.uid());
  _new INTEGER := 0;
  _pts INTEGER := 0;
BEGIN
  IF _target IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  WITH prog AS (SELECT * FROM public.achievement_progress(_target)),
  ins AS (
    INSERT INTO public.user_achievements (user_id, achievement_id)
    SELECT _target, a.id
      FROM public.achievements a
      JOIN prog p ON p.metric = a.metric
     WHERE p.value >= a.threshold
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO _new FROM ins;

  SELECT COALESCE(sum(a.points), 0)::int INTO _pts
    FROM public.user_achievements ua
    JOIN public.achievements a ON a.id = ua.achievement_id
   WHERE ua.user_id = _target;

  unlocked := _new;
  points := _pts;
  level := 1 + (_pts / 100);
  RETURN NEXT;
END; $$;

GRANT EXECUTE ON FUNCTION public.sync_achievements(UUID) TO authenticated;