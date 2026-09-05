ALTER TABLE public.lives ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS lives_live_heartbeat_idx ON public.lives (last_heartbeat_at DESC) WHERE status = 'live';

CREATE OR REPLACE FUNCTION public.end_stale_lives()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.lives
     SET status = 'ended',
         ended_at = COALESCE(ended_at, now()),
         viewer_count = 0
   WHERE status IN ('live', 'preparing')
     AND last_heartbeat_at < now() - interval '3 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.end_stale_lives() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_stale_lives() TO authenticated, service_role;

-- Host-only heartbeat
CREATE OR REPLACE FUNCTION public.live_heartbeat(_live_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lives
     SET last_heartbeat_at = now()
   WHERE id = _live_id
     AND host_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.live_heartbeat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_heartbeat(uuid) TO authenticated, service_role;