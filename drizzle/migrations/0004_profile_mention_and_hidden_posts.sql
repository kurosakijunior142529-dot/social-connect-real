ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS featured_username text;

CREATE TABLE IF NOT EXISTS public.hidden_posts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'not_interested',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

GRANT SELECT, INSERT, DELETE ON public.hidden_posts TO authenticated;
GRANT ALL ON public.hidden_posts TO service_role;

ALTER TABLE public.hidden_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own hidden posts" ON public.hidden_posts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users hide posts" ON public.hidden_posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users unhide posts" ON public.hidden_posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
