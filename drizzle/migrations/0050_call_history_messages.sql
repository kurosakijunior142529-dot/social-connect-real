CREATE OR REPLACE FUNCTION public.log_call_to_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv uuid;
  _dur int := 0;
  _outcome text;
BEGIN
  IF NEW.status NOT IN ('ended','rejected','canceled','missed') THEN RETURN NEW; END IF;
  IF OLD.status IN ('ended','rejected','canceled','missed') THEN RETURN NEW; END IF;

  SELECT id INTO _conv FROM public.conversations
  WHERE (user_a = NEW.caller_id AND user_b = NEW.callee_id)
     OR (user_a = NEW.callee_id AND user_b = NEW.caller_id)
  LIMIT 1;
  IF _conv IS NULL THEN RETURN NEW; END IF;

  IF NEW.accepted_at IS NOT NULL THEN
    _dur := GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(NEW.ended_at, now()) - NEW.accepted_at))::int);
    _outcome := 'completed';
  ELSIF NEW.status = 'rejected' THEN
    _outcome := 'declined';
  ELSE
    _outcome := 'missed';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, kind, content, meta)
  VALUES (_conv, NEW.caller_id, 'call',
    CASE WHEN NEW.call_type = 'video' THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
    jsonb_build_object('call_id', NEW.id, 'call_type', NEW.call_type, 'outcome', _outcome, 'duration_s', _dur));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_call_to_conversation ON public.calls;
CREATE TRIGGER trg_log_call_to_conversation
AFTER UPDATE OF status ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.log_call_to_conversation();