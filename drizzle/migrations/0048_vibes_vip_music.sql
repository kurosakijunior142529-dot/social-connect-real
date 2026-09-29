CREATE TABLE IF NOT EXISTS public.close_friends (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
GRANT SELECT, INSERT, DELETE ON public.close_friends TO authenticated;
GRANT ALL ON public.close_friends TO service_role;
ALTER TABLE public.close_friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own close friends list" ON public.close_friends FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_close_friend(_owner uuid, _viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.close_friends WHERE user_id = _owner AND friend_id = _viewer)
$$;

ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','vip'));
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS music_track_id uuid REFERENCES public.music_tracks(id) ON DELETE SET NULL;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS music_start_ms integer NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "Anyone authenticated reads active stories" ON public.stories;
CREATE POLICY "Anyone authenticated reads active stories" ON public.stories FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (expires_at > now() AND NOT public.is_blocked_pair(auth.uid(), user_id)
        AND (audience = 'all' OR public.is_close_friend(user_id, auth.uid())))
  );