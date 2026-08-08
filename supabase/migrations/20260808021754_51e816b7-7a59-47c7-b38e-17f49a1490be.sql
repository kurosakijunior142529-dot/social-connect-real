CREATE TABLE IF NOT EXISTS public.reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  comment text,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);
GRANT SELECT, INSERT, DELETE ON public.reposts TO authenticated;
GRANT ALL ON public.reposts TO service_role;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reposts_select_all" ON public.reposts FOR SELECT TO authenticated USING (true);
CREATE POLICY "reposts_insert_own" ON public.reposts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reposts_delete_own" ON public.reposts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS reposts_user_idx ON public.reposts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reposts_post_idx ON public.reposts(post_id);