-- Post vs Reel ------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_kind TEXT NOT NULL DEFAULT 'post';

DO $$ BEGIN
  ALTER TABLE public.posts ADD CONSTRAINT posts_post_kind_check CHECK (post_kind IN ('post','reel'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.posts SET post_kind = 'reel' WHERE media_type = 'video' AND post_kind = 'post';
CREATE INDEX IF NOT EXISTS posts_post_kind_created_idx ON public.posts(post_kind, created_at DESC);

-- Sticker as a comment ------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS sticker_url TEXT;

-- Official sticker pack -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pack TEXT NOT NULL DEFAULT 'oficial',
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stickers TO authenticated;
GRANT SELECT ON public.stickers TO anon;
GRANT ALL ON public.stickers TO service_role;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Stickers are viewable by everyone" ON public.stickers;
CREATE POLICY "Stickers are viewable by everyone" ON public.stickers FOR SELECT USING (active);

-- User uploaded stickers ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stickers TO authenticated;
GRANT ALL ON public.user_stickers TO service_role;
ALTER TABLE public.user_stickers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own stickers" ON public.user_stickers;
CREATE POLICY "Users manage own stickers" ON public.user_stickers FOR ALL
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS user_stickers_user_idx ON public.user_stickers(user_id, created_at DESC);
