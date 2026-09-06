-- Vibe Check diário
CREATE TABLE public.vibe_checkins (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  mood text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vibe_checkins TO authenticated;
GRANT ALL ON public.vibe_checkins TO service_role;

ALTER TABLE public.vibe_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vibe_checkins_own_select" ON public.vibe_checkins
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "vibe_checkins_own_insert" ON public.vibe_checkins
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "vibe_checkins_own_update" ON public.vibe_checkins
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "vibe_checkins_own_delete" ON public.vibe_checkins
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX vibe_checkins_day_idx ON public.vibe_checkins (day DESC);

-- Registrar o meu check-in do dia
CREATE OR REPLACE FUNCTION public.set_vibe_checkin(_mood text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _mood IS NULL OR length(trim(_mood)) = 0 OR length(_mood) > 24 THEN
    RAISE EXCEPTION 'invalid mood';
  END IF;
  INSERT INTO public.vibe_checkins (user_id, day, mood, note)
  VALUES (auth.uid(), (now() AT TIME ZONE 'utc')::date, _mood, nullif(left(coalesce(_note,''), 120), ''))
  ON CONFLICT (user_id, day) DO UPDATE SET mood = EXCLUDED.mood, note = EXCLUDED.note, created_at = now();
END;
$$;

-- Só quem respondeu hoje vê as respostas de quem segue
CREATE OR REPLACE FUNCTION public.friends_vibe_checkins()
RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, mood text, note text, mine boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  today AS (SELECT (now() AT TIME ZONE 'utc')::date AS d),
  answered AS (
    SELECT 1 FROM public.vibe_checkins c, me, today
    WHERE c.user_id = me.id AND c.day = today.d
  )
  SELECT c.user_id, p.username, p.display_name, p.avatar_url, c.mood, c.note,
         c.user_id = (SELECT id FROM me) AS mine
  FROM public.vibe_checkins c
  JOIN public.profiles p ON p.id = c.user_id, today, me
  WHERE EXISTS (SELECT 1 FROM answered)
    AND c.day = today.d
    AND (
      c.user_id = me.id
      OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = me.id AND f.following_id = c.user_id)
    )
    AND NOT public.is_blocked_pair(me.id, c.user_id)
  ORDER BY mine DESC, c.created_at DESC
  LIMIT 60;
$$;

GRANT EXECUTE ON FUNCTION public.set_vibe_checkin(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.friends_vibe_checkins() TO authenticated;

-- Placar da semana entre amigos
CREATE OR REPLACE FUNCTION public.weekly_friends_board()
RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text, streak integer, messages bigint, score bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT auth.uid() AS id),
  week_start AS (SELECT date_trunc('week', now()) AS ws),
  peers AS (
    SELECT f.following_id AS id FROM public.follows f, me WHERE f.follower_id = me.id
    UNION
    SELECT me.id FROM me
  ),
  msg AS (
    SELECT m.sender_id AS id, count(*) AS n
    FROM public.messages m, week_start
    WHERE m.created_at >= week_start.ws
      AND m.sender_id IN (SELECT id FROM peers)
    GROUP BY m.sender_id
  ),
  st AS (
    SELECT u.id, max(s.streak) AS streak
    FROM peers u
    LEFT JOIN public.chat_streaks s ON s.user_a = u.id OR s.user_b = u.id
    GROUP BY u.id
  )
  SELECT p.id, p.username, p.display_name, p.avatar_url,
         coalesce(st.streak, 0)::int AS streak,
         coalesce(msg.n, 0) AS messages,
         (coalesce(st.streak, 0) * 10 + coalesce(msg.n, 0))::bigint AS score
  FROM peers u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN st ON st.id = u.id
  LEFT JOIN msg ON msg.id = u.id, me
  WHERE NOT public.is_blocked_pair(me.id, p.id)
  ORDER BY score DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_friends_board() TO authenticated;