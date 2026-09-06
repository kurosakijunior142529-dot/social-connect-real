CREATE TABLE public.realities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  original_image text,
  generated_image text NOT NULL,
  transformation_prompt text,
  style text NOT NULL DEFAULT 'custom',
  privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','invite','friends')),
  is_featured boolean NOT NULL DEFAULT false,
  room_id uuid REFERENCES public.watch_rooms(id) ON DELETE SET NULL,
  voice_channel_id uuid REFERENCES public.voice_channels(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX realities_creator_idx ON public.realities (creator_id, created_at DESC);
CREATE INDEX realities_public_idx ON public.realities (created_at DESC) WHERE privacy = 'public';
CREATE INDEX realities_room_idx ON public.realities (room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.realities TO authenticated;
GRANT ALL ON public.realities TO service_role;

ALTER TABLE public.realities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_reality(_reality_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.realities r
    WHERE r.id = _reality_id
      AND (
        r.creator_id = auth.uid()
        OR r.privacy = 'public'
        OR (
          r.privacy = 'friends' AND EXISTS (
            SELECT 1 FROM public.follows f1
            JOIN public.follows f2
              ON f2.follower_id = r.creator_id AND f2.following_id = auth.uid()
            WHERE f1.follower_id = auth.uid() AND f1.following_id = r.creator_id
          )
        )
        OR EXISTS (
          SELECT 1 FROM public.watch_room_members m
          WHERE m.room_id = r.room_id AND m.user_id = auth.uid() AND m.left_at IS NULL
        )
      )
  );
$$;

CREATE POLICY "realities visible by privacy"
ON public.realities FOR SELECT TO authenticated
USING (public.can_view_reality(id));

CREATE POLICY "creator inserts own reality"
ON public.realities FOR INSERT TO authenticated
WITH CHECK (creator_id = auth.uid());

CREATE POLICY "creator updates own reality"
ON public.realities FOR UPDATE TO authenticated
USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());

CREATE POLICY "creator deletes own reality"
ON public.realities FOR DELETE TO authenticated
USING (creator_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_reality()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER realities_touch BEFORE UPDATE ON public.realities
FOR EACH ROW EXECUTE FUNCTION public.touch_reality();

-- Apenas uma realidade em destaque por usuário
CREATE UNIQUE INDEX realities_one_featured ON public.realities (creator_id) WHERE is_featured;

-- Realidades públicas com contagem de pessoas na sala
CREATE OR REPLACE FUNCTION public.list_public_realities(_limit int DEFAULT 30, _offset int DEFAULT 0)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  generated_image text,
  style text,
  creator_id uuid,
  username text,
  display_name text,
  avatar_url text,
  room_id uuid,
  people int,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.name, r.description, r.generated_image, r.style,
         r.creator_id, p.username, p.display_name, p.avatar_url, r.room_id,
         COALESCE((SELECT count(*)::int FROM public.watch_room_members m
                   WHERE m.room_id = r.room_id AND m.left_at IS NULL), 0) AS people,
         r.created_at
  FROM public.realities r
  JOIN public.profiles p ON p.id = r.creator_id
  WHERE r.privacy = 'public'
    AND NOT public.is_blocked_pair(auth.uid(), r.creator_id)
  ORDER BY r.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 30), 60) OFFSET GREATEST(COALESCE(_offset, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.list_public_realities(int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_reality(uuid) TO authenticated;