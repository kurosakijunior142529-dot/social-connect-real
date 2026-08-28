-- 1) Enquetes
CREATE TABLE public.polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 200),
  options jsonb NOT NULL CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6),
  closes_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.polls TO authenticated;
GRANT SELECT ON public.polls TO anon;
GRANT ALL ON public.polls TO service_role;

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Polls viewable by everyone" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Users create own polls" ON public.polls FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- 2) Votos (um por pessoa, definitivo)
CREATE TABLE public.poll_votes (
  poll_id uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_index int NOT NULL CHECK (option_index >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);

GRANT SELECT, INSERT ON public.poll_votes TO authenticated;
GRANT ALL ON public.poll_votes TO service_role;

ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own vote" ON public.poll_votes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users vote once while open" ON public.poll_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_id
        AND p.closes_at > now()
        AND option_index < jsonb_array_length(p.options)
    )
  );

-- Totais agregados sem expor quem votou
CREATE OR REPLACE FUNCTION public.poll_counts(_poll_id uuid)
RETURNS TABLE (option_index int, votes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.option_index, count(*)::bigint
  FROM public.poll_votes v
  WHERE v.poll_id = _poll_id
  GROUP BY v.option_index
$$;

REVOKE ALL ON FUNCTION public.poll_counts(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.poll_counts(uuid) TO authenticated;

-- 3) Publicações de texto e enquete
ALTER TYPE media_type ADD VALUE IF NOT EXISTS 'text';
ALTER TABLE public.posts ALTER COLUMN media_url DROP NOT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS poll_id uuid REFERENCES public.polls(id) ON DELETE SET NULL;

-- 4) Enquete em comentários (somente o dono do vídeo)
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS poll_id uuid REFERENCES public.polls(id) ON DELETE SET NULL;
ALTER TABLE public.comments ALTER COLUMN content DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.owns_post(_post_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.posts p WHERE p.id = _post_id AND p.author_id = _user_id)
$$;

REVOKE ALL ON FUNCTION public.owns_post(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.owns_post(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users comment as self" ON public.comments;
CREATE POLICY "Users comment as self" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND can_interact(auth.uid())
    AND (poll_id IS NULL OR public.owns_post(post_id, auth.uid()))
  );

-- 5) Segurança: presentes só pela função que debita moedas
REVOKE INSERT, UPDATE, DELETE ON public.live_gifts FROM authenticated, anon;