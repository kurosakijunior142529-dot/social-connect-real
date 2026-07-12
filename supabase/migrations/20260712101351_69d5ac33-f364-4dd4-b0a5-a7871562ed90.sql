ALTER TABLE public.call_signals REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
  END IF;
END $$;