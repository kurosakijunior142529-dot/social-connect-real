ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS sticker jsonb;

CREATE TABLE public.story_sticker_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  option_index int,
  answer text CHECK (answer IS NULL OR char_length(answer) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.story_sticker_responses TO authenticated;
GRANT ALL ON public.story_sticker_responses TO service_role;
ALTER TABLE public.story_sticker_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Insert own sticker response" ON public.story_sticker_responses
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Read own or on my story" ON public.story_sticker_responses
  FOR SELECT TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id AND s.user_id = auth.uid())
  );
CREATE POLICY "Delete own sticker response" ON public.story_sticker_responses
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.story_poll_counts(_story_id uuid)
RETURNS TABLE(option_index int, votes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.option_index, count(*) FROM public.story_sticker_responses r
  WHERE r.story_id = _story_id AND r.option_index IS NOT NULL
  GROUP BY r.option_index
$$;
REVOKE EXECUTE ON FUNCTION public.story_poll_counts(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.story_poll_counts(uuid) TO authenticated;