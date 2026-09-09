ALTER TABLE public.ai_generations
  ADD COLUMN IF NOT EXISTS cost_credits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS aspect_ratio text,
  ADD COLUMN IF NOT EXISTS with_audio boolean,
  ADD COLUMN IF NOT EXISTS style text,
  ADD COLUMN IF NOT EXISTS refunded boolean NOT NULL DEFAULT false;

-- Débito atômico de créditos (moedas) do próprio usuário autenticado.
CREATE OR REPLACE FUNCTION public.spend_ai_credits(_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _new integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _amount IS NULL OR _amount < 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  IF _amount = 0 THEN
    RETURN COALESCE((SELECT balance FROM public.user_coins WHERE user_id = _uid), 0);
  END IF;

  UPDATE public.user_coins
     SET balance = balance - _amount, updated_at = now()
   WHERE user_id = _uid AND balance >= _amount
   RETURNING balance INTO _new;

  IF _new IS NULL THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  RETURN _new;
END;
$$;

-- Estorno quando a geração falha (só devolve o que foi debitado).
CREATE OR REPLACE FUNCTION public.refund_ai_credits(_generation uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cost integer;
  _new integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.ai_generations
     SET refunded = true, updated_at = now()
   WHERE id = _generation AND user_id = _uid AND refunded = false AND cost_credits > 0
   RETURNING cost_credits INTO _cost;
  IF _cost IS NULL THEN
    RETURN COALESCE((SELECT balance FROM public.user_coins WHERE user_id = _uid), 0);
  END IF;
  INSERT INTO public.user_coins(user_id, balance) VALUES (_uid, _cost)
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_coins.balance + _cost, updated_at = now()
    RETURNING balance INTO _new;
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.spend_ai_credits(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_ai_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_ai_credits(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(uuid) TO authenticated, service_role;