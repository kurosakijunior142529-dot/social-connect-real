
CREATE TYPE public.call_type AS ENUM ('audio','video');
CREATE TYPE public.call_status AS ENUM ('ringing','accepted','rejected','ended','missed','canceled');

CREATE TABLE public.calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_type public.call_type NOT NULL DEFAULT 'video',
  status public.call_status NOT NULL DEFAULT 'ringing',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);

CREATE INDEX calls_callee_status_idx ON public.calls (callee_id, status);
CREATE INDEX calls_caller_idx ON public.calls (caller_id);

GRANT SELECT, INSERT, UPDATE ON public.calls TO authenticated;
GRANT ALL ON public.calls TO service_role;

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view calls"
  ON public.calls FOR SELECT TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE POLICY "Caller can create call"
  ON public.calls FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = caller_id
    AND caller_id <> callee_id
    AND NOT public.is_blocked_pair(caller_id, callee_id)
  );

CREATE POLICY "Participants can update call"
  ON public.calls FOR UPDATE TO authenticated
  USING (auth.uid() = caller_id OR auth.uid() = callee_id)
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

CREATE TRIGGER calls_set_updated_at
  BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
