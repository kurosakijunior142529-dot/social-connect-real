-- 1) Tokens de push por usuário
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT ALL ON public.push_tokens TO service_role;

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON public.push_tokens;
CREATE POLICY "Users manage own push tokens"
  ON public.push_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2) Config privada (segredo do dispatch + URL base). Sem policies: só service_role.
CREATE TABLE IF NOT EXISTS public.app_private_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_private_config TO service_role;
ALTER TABLE public.app_private_config ENABLE ROW LEVEL SECURITY;

INSERT INTO public.app_private_config(key, value) VALUES
  ('push_dispatch_secret', 'a3be94c960c847ff63940e91d521a567576db887d378b14f'),
  ('push_base_url', 'https://vibelyconect.lovable.app')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 3) pg_net para chamar o endpoint de envio
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.push_dispatch(_kind text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _secret text;
  _base text;
BEGIN
  SELECT value INTO _secret FROM public.app_private_config WHERE key = 'push_dispatch_secret';
  SELECT value INTO _base FROM public.app_private_config WHERE key = 'push_base_url';
  IF _secret IS NULL OR _base IS NULL THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := _base || '/api/public/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-vibely-push-secret', _secret
    ),
    body := jsonb_build_object('kind', _kind, 'id', _id),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RETURN;
END;
$$;

-- 4) Triggers
CREATE OR REPLACE FUNCTION public.on_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.push_dispatch('notification', NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_push ON public.notifications;
CREATE TRIGGER trg_notifications_push
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.on_notification_push();

CREATE OR REPLACE FUNCTION public.on_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    PERFORM public.push_dispatch('message', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_push ON public.messages;
CREATE TRIGGER trg_messages_push
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.on_message_push();

CREATE OR REPLACE FUNCTION public.on_chat_message_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    PERFORM public.push_dispatch('chat_message', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_push ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_push
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_push();

CREATE OR REPLACE FUNCTION public.on_call_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ringing' THEN
    PERFORM public.push_dispatch('call', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calls_push ON public.calls;
CREATE TRIGGER trg_calls_push
AFTER INSERT ON public.calls
FOR EACH ROW EXECUTE FUNCTION public.on_call_push();
