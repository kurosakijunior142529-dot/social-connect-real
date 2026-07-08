DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.name);
  END LOOP;
END $$;

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.posts TO anon;
GRANT SELECT ON public.comments TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.follows TO anon;