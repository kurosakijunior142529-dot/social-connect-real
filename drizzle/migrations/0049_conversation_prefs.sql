CREATE TABLE public.conversation_prefs (
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pinned_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  hidden boolean NOT NULL DEFAULT false,
  marked_unread boolean NOT NULL DEFAULT false,
  cleared_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_prefs TO authenticated;
GRANT ALL ON public.conversation_prefs TO service_role;
ALTER TABLE public.conversation_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.conversation_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.chat_vault (
  user_id uuid PRIMARY KEY,
  pin_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_vault TO authenticated;
GRANT ALL ON public.chat_vault TO service_role;
ALTER TABLE public.chat_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own vault" ON public.chat_vault FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);