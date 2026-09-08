ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS video_url text;

CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid,
  message_id uuid,
  kind text NOT NULL CHECK (kind IN ('image','video')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  prompt text NOT NULL,
  provider text NOT NULL DEFAULT 'lovable-ai-gateway',
  model text NOT NULL,
  job_id text,
  result_path text,
  error text,
  duration_seconds integer,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_generations TO authenticated;
GRANT ALL ON public.ai_generations TO service_role;

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own generations select" ON public.ai_generations;
CREATE POLICY "own generations select" ON public.ai_generations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "own generations insert" ON public.ai_generations;
CREATE POLICY "own generations insert" ON public.ai_generations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own generations update" ON public.ai_generations;
CREATE POLICY "own generations update" ON public.ai_generations
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own generations delete" ON public.ai_generations;
CREATE POLICY "own generations delete" ON public.ai_generations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS ai_generations_user_created_idx ON public.ai_generations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_generations_status_idx ON public.ai_generations (status);