CREATE OR REPLACE FUNCTION public.send_live_gift(_live_id UUID, _gift_id UUID, _message TEXT DEFAULT NULL)
RETURNS TABLE(balance INTEGER, coins_spent INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me UUID := auth.uid();
  _host UUID;
  _cost INTEGER;
  _bal INTEGER;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.can_interact(_me) THEN RAISE EXCEPTION 'Conta restrita'; END IF;
  IF NOT public.check_rate_limit('live_gift', 60, 60) THEN
    RAISE EXCEPTION 'Muitos presentes em pouco tempo';
  END IF;

  SELECT host_id INTO _host FROM public.lives WHERE id = _live_id;
  IF _host IS NULL THEN RAISE EXCEPTION 'Live não encontrada'; END IF;
  IF NOT public.can_view_live(_live_id, _me) THEN RAISE EXCEPTION 'Sem acesso a esta live'; END IF;

  SELECT cost_coins INTO _cost FROM public.gift_catalog WHERE id = _gift_id AND active;
  IF _cost IS NULL THEN RAISE EXCEPTION 'Presente indisponível'; END IF;

  UPDATE public.user_coins SET balance = balance - _cost, updated_at = now()
    WHERE user_id = _me AND balance >= _cost
    RETURNING balance INTO _bal;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  PERFORM public.credit_coins(_host, _cost);

  INSERT INTO public.live_gifts(live_id, sender_id, recipient_id, gift_id, coins_spent, message)
  VALUES (_live_id, _me, _host, _gift_id, _cost, left(NULLIF(trim(COALESCE(_message,'')),''), 200));

  balance := _bal; coins_spent := _cost;
  RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.send_live_gift(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_live_gift(UUID, UUID, TEXT) TO authenticated;

-- Clients may no longer insert gift rows directly.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname='public' AND tablename='live_gifts' AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.live_gifts', p.policyname);
  END LOOP;
END $$;
REVOKE INSERT ON public.live_gifts FROM authenticated;