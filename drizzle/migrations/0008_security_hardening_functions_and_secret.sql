-- 1) search_path fixo nas funções que ainda não tinham
ALTER FUNCTION public.normalize_invite_code(text) SET search_path = public;
ALTER FUNCTION public.sync_watch_room_visibility() SET search_path = public;

-- 2) Nenhuma função SECURITY DEFINER do schema public pode ser executada por visitantes anônimos
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, (p.prorettype = 'trigger'::regtype) AS is_trigger
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF NOT r.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    END IF;
  END LOOP;
END $$;

-- 3) Rotaciona o segredo interno de push (o valor antigo estava no repositório)
UPDATE public.app_private_config
SET value = encode(gen_random_bytes(32), 'hex'), updated_at = now()
WHERE key = 'push_dispatch_secret';