-- Memórias persistentes da IA por usuário
CREATE TABLE public.ai_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  memory TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memories TO authenticated;
GRANT ALL ON public.ai_memories TO service_role;
ALTER TABLE public.ai_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memories" ON public.ai_memories FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_memories_user_idx ON public.ai_memories (user_id, updated_at DESC);

-- Arquivos enviados para a IA
CREATE TABLE public.ai_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id UUID REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_files TO authenticated;
GRANT ALL ON public.ai_files TO service_role;
ALTER TABLE public.ai_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai files" ON public.ai_files FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_files_thread_idx ON public.ai_files (thread_id, created_at DESC);
CREATE INDEX ai_files_user_idx ON public.ai_files (user_id, created_at DESC);

-- Resumos de conversas longas
CREATE TABLE public.ai_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id UUID NOT NULL REFERENCES public.ai_threads(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  covered_until TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_summaries TO authenticated;
GRANT ALL ON public.ai_summaries TO service_role;
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai summaries" ON public.ai_summaries FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ai_summaries_user_idx ON public.ai_summaries (user_id, updated_at DESC);

-- Anexos nas mensagens da IA
ALTER TABLE public.ai_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TRIGGER ai_memories_updated_at BEFORE UPDATE ON public.ai_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ai_summaries_updated_at BEFORE UPDATE ON public.ai_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();