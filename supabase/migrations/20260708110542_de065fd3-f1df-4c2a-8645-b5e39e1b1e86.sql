
ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_bucket text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_duration_ms integer,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_bucket text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_name text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_duration_ms integer,
  ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS pinned_by uuid,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_pinned ON public.messages(conversation_id) WHERE pinned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON public.chat_messages(chat_id) WHERE pinned_at IS NOT NULL;

-- storage policies for the new chat buckets
DO $$
DECLARE b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['chat-audio','chat-video','chat-docs'] LOOP
    BEGIN
      EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L)$p$,
        'chat_media_read_'||replace(b,'-','_'), b);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)$p$,
        'chat_media_insert_'||replace(b,'-','_'), b);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      EXECUTE format($p$CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)$p$,
        'chat_media_delete_'||replace(b,'-','_'), b);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;
