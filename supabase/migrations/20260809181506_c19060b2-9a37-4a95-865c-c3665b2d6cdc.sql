-- ============ PONG: fila de matchmaking ============
CREATE TABLE public.pong_queue (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  room TEXT,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pong_queue TO authenticated;
GRANT ALL ON public.pong_queue TO service_role;

ALTER TABLE public.pong_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pong_queue_own_select" ON public.pong_queue
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pong_queue_own_insert" ON public.pong_queue
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pong_queue_own_update" ON public.pong_queue
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "pong_queue_own_delete" ON public.pong_queue
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ PONG: estatisticas / progressao ============
CREATE TABLE public.pong_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  points_scored INTEGER NOT NULL DEFAULT 0,
  points_conceded INTEGER NOT NULL DEFAULT 0,
  favorite_power TEXT,
  cosmetics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pong_stats TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pong_stats TO authenticated;
GRANT ALL ON public.pong_stats TO service_role;

ALTER TABLE public.pong_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pong_stats_public_read" ON public.pong_stats
  FOR SELECT USING (true);
CREATE POLICY "pong_stats_own_insert" ON public.pong_stats
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "pong_stats_own_update" ON public.pong_stats
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER pong_stats_updated_at BEFORE UPDATE ON public.pong_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PONG: historico de partidas ============
CREATE TABLE public.pong_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  room TEXT,
  my_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  won BOOLEAN NOT NULL DEFAULT false,
  power TEXT,
  arena TEXT,
  xp_gained INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX pong_matches_user_idx ON public.pong_matches (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.pong_matches TO authenticated;
GRANT ALL ON public.pong_matches TO service_role;

ALTER TABLE public.pong_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pong_matches_own_select" ON public.pong_matches
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "pong_matches_own_insert" ON public.pong_matches
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ Matchmaking: entra na fila ou pareia ============
CREATE OR REPLACE FUNCTION public.pong_find_match()
RETURNS TABLE(room TEXT, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me UUID := auth.uid();
  _peer RECORD;
  _room TEXT;
  _mine RECORD;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- limpa entradas antigas abandonadas
  DELETE FROM public.pong_queue
   WHERE created_at < now() - interval '2 minutes' AND matched_at IS NULL;

  -- ja fui pareado enquanto esperava?
  SELECT * INTO _mine FROM public.pong_queue WHERE user_id = _me FOR UPDATE;
  IF FOUND AND _mine.room IS NOT NULL THEN
    DELETE FROM public.pong_queue WHERE user_id = _me;
    room := _mine.room; status := 'matched'; RETURN NEXT; RETURN;
  END IF;

  -- procura alguem esperando
  SELECT * INTO _peer FROM public.pong_queue
   WHERE user_id <> _me AND room IS NULL
   ORDER BY created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    _room := 'mm' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    UPDATE public.pong_queue SET room = _room, matched_at = now() WHERE user_id = _peer.user_id;
    DELETE FROM public.pong_queue WHERE user_id = _me;
    room := _room; status := 'matched'; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.pong_queue(user_id, room, matched_at, created_at)
  VALUES (_me, NULL, NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET created_at = now(), room = NULL, matched_at = NULL;

  room := NULL; status := 'waiting'; RETURN NEXT; RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pong_find_match() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pong_find_match() TO authenticated;

CREATE OR REPLACE FUNCTION public.pong_leave_queue()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$ DELETE FROM public.pong_queue WHERE user_id = auth.uid(); $$;

REVOKE EXECUTE ON FUNCTION public.pong_leave_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pong_leave_queue() TO authenticated;

-- ============ Registro de resultado + XP ============
CREATE OR REPLACE FUNCTION public.pong_record_result(
  _opponent UUID,
  _room TEXT,
  _my_score INTEGER,
  _opp_score INTEGER,
  _power TEXT DEFAULT NULL,
  _arena TEXT DEFAULT NULL
)
RETURNS TABLE(xp INTEGER, level INTEGER, xp_gained INTEGER, streak INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me UUID := auth.uid();
  _won BOOLEAN;
  _gain INTEGER;
  _row public.pong_stats%ROWTYPE;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _my_score < 0 OR _opp_score < 0 OR _my_score > 99 OR _opp_score > 99 THEN
    RAISE EXCEPTION 'Placar inválido';
  END IF;

  _won := _my_score > _opp_score;
  _gain := GREATEST(10, _my_score * 12 + CASE WHEN _won THEN 60 ELSE 0 END);

  INSERT INTO public.pong_stats(user_id) VALUES (_me)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.pong_stats s SET
    xp = s.xp + _gain,
    wins = s.wins + CASE WHEN _won THEN 1 ELSE 0 END,
    losses = s.losses + CASE WHEN _won THEN 0 ELSE 1 END,
    streak = CASE WHEN _won THEN s.streak + 1 ELSE 0 END,
    best_streak = GREATEST(s.best_streak, CASE WHEN _won THEN s.streak + 1 ELSE 0 END),
    points_scored = s.points_scored + _my_score,
    points_conceded = s.points_conceded + _opp_score,
    favorite_power = COALESCE(_power, s.favorite_power),
    level = 1 + FLOOR((s.xp + _gain) / 500.0)::INTEGER,
    updated_at = now()
  WHERE s.user_id = _me
  RETURNING * INTO _row;

  INSERT INTO public.pong_matches(user_id, opponent_id, room, my_score, opponent_score, won, power, arena, xp_gained)
  VALUES (_me, _opponent, _room, _my_score, _opp_score, _won, _power, _arena, _gain);

  xp := _row.xp; level := _row.level; xp_gained := _gain; streak := _row.streak;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pong_record_result(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pong_record_result(UUID, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;