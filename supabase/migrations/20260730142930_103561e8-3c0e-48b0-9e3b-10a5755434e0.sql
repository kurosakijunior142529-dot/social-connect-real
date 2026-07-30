ALTER TABLE public.call_signals DROP CONSTRAINT IF EXISTS call_signals_kind_check;
ALTER TABLE public.call_signals ADD CONSTRAINT call_signals_kind_check CHECK (kind IN ('offer', 'answer', 'ice', 'bye', 'caption'));
CREATE INDEX IF NOT EXISTS idx_calls_participants_status ON public.calls (caller_id, callee_id, status, updated_at DESC);