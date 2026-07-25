
-- 1. Profile flags
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT false;

-- 2. App settings (singleton row)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  coin_to_brl_rate NUMERIC(12,6) NOT NULL DEFAULT 0.0645,
  min_withdrawal_brl NUMERIC(12,2) NOT NULL DEFAULT 50.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO authenticated, anon;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins update settings" ON public.app_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.app_settings (id, coin_to_brl_rate, min_withdrawal_brl)
  VALUES (true, 0.0645, 50.00)
  ON CONFLICT (id) DO NOTHING;

-- 3. Bank accounts (Pix ou conta bancária)
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holder_name TEXT NOT NULL,
  holder_document TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('pix','bank')),
  pix_key_type TEXT CHECK (pix_key_type IN ('cpf','cnpj','email','phone','random')),
  pix_key TEXT,
  bank_name TEXT,
  bank_agency TEXT,
  bank_account TEXT,
  bank_account_type TEXT CHECK (bank_account_type IN ('checking','savings')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_one_active ON public.bank_accounts(user_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own bank accounts" ON public.bank_accounts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins view all bank accounts" ON public.bank_accounts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER bank_accounts_updated BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Withdrawals
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  bank_snapshot JSONB NOT NULL,
  amount_coins INTEGER NOT NULL CHECK (amount_coins > 0),
  amount_brl NUMERIC(12,2) NOT NULL CHECK (amount_brl > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  admin_note TEXT,
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS withdrawals_user_idx ON public.withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON public.withdrawals(status, created_at DESC);
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own withdrawals" ON public.withdrawals FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins view withdrawals" ON public.withdrawals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER withdrawals_updated BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Conversion helper
CREATE OR REPLACE FUNCTION public.coins_to_brl(_coins INTEGER)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ROUND((_coins::NUMERIC * coin_to_brl_rate)::NUMERIC, 2)
  FROM public.app_settings WHERE id = true;
$$;

-- 6. Request withdrawal (atomic debit)
CREATE OR REPLACE FUNCTION public.request_withdrawal(_bank_account_id UUID, _amount_coins INTEGER)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me UUID := auth.uid();
  _bank RECORD;
  _rate NUMERIC;
  _min_brl NUMERIC;
  _brl NUMERIC;
  _current_balance INTEGER;
  _wid UUID;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_coins <= 0 THEN RAISE EXCEPTION 'Valor inválido'; END IF;

  SELECT * INTO _bank FROM public.bank_accounts
    WHERE id = _bank_account_id AND user_id = _me AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta bancária não encontrada'; END IF;

  SELECT coin_to_brl_rate, min_withdrawal_brl INTO _rate, _min_brl
    FROM public.app_settings WHERE id = true;
  _brl := ROUND((_amount_coins::NUMERIC * _rate)::NUMERIC, 2);
  IF _brl < _min_brl THEN
    RAISE EXCEPTION 'Valor abaixo do mínimo de saque (R$ %)', _min_brl;
  END IF;

  -- Debita moedas
  UPDATE public.user_coins
    SET balance = balance - _amount_coins, updated_at = now()
    WHERE user_id = _me AND balance >= _amount_coins
    RETURNING balance INTO _current_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  INSERT INTO public.withdrawals (user_id, bank_account_id, bank_snapshot, amount_coins, amount_brl)
  VALUES (_me, _bank.id, to_jsonb(_bank), _amount_coins, _brl)
  RETURNING id INTO _wid;

  RETURN _wid;
END;
$$;

-- 7. Admin update withdrawal
CREATE OR REPLACE FUNCTION public.admin_update_withdrawal(_withdrawal_id UUID, _new_status TEXT, _note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me UUID := auth.uid();
  _w RECORD;
BEGIN
  IF NOT public.has_role(_me, 'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _new_status NOT IN ('approved','paid','rejected') THEN RAISE EXCEPTION 'Status inválido'; END IF;

  SELECT * INTO _w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saque não encontrado'; END IF;

  -- Idempotência: nao reprocessar
  IF _w.status IN ('paid','rejected') THEN
    RAISE EXCEPTION 'Saque já finalizado';
  END IF;

  -- Se rejeitar, devolve as moedas
  IF _new_status = 'rejected' THEN
    PERFORM public.credit_coins(_w.user_id, _w.amount_coins);
    INSERT INTO public.notifications(user_id, actor_id, type, entity_type, entity_id, metadata)
    VALUES (_w.user_id, _me, 'withdrawal_rejected', 'withdrawal', _w.id,
      jsonb_build_object('coins', _w.amount_coins, 'brl', _w.amount_brl, 'note', COALESCE(_note,'')));
  ELSIF _new_status = 'paid' THEN
    INSERT INTO public.notifications(user_id, actor_id, type, entity_type, entity_id, metadata)
    VALUES (_w.user_id, _me, 'withdrawal_paid', 'withdrawal', _w.id,
      jsonb_build_object('brl', _w.amount_brl));
  END IF;

  UPDATE public.withdrawals
    SET status = _new_status,
        admin_note = COALESCE(_note, admin_note),
        processed_by = _me,
        processed_at = CASE WHEN _new_status IN ('paid','rejected') THEN now() ELSE processed_at END,
        updated_at = now()
    WHERE id = _withdrawal_id;
END;
$$;

-- 8. Bootstrap admin junior_01 + verificado + creator + 500k moedas
DO $$
DECLARE _uid UUID;
BEGIN
  SELECT id INTO _uid FROM public.profiles WHERE username = 'junior_01';
  IF _uid IS NOT NULL THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'admin')
      ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET is_verified = true, is_creator = true WHERE id = _uid;
    INSERT INTO public.user_coins(user_id, balance) VALUES (_uid, 500000)
      ON CONFLICT (user_id) DO UPDATE SET balance = public.user_coins.balance + 500000, updated_at = now();
  END IF;
END $$;

-- 9. Segurança: audiência de lives (findings do scanner)
DROP POLICY IF EXISTS "Lives visible" ON public.lives;
CREATE POLICY "Lives visible" ON public.lives FOR SELECT USING (
  host_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = lives.id AND m.user_id = auth.uid())
  OR audience = 'public'
  OR (audience = 'followers' AND EXISTS (
       SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = lives.host_id))
  OR (audience = 'friends' AND EXISTS (
       SELECT 1 FROM public.follows f1 JOIN public.follows f2
         ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
       WHERE f1.follower_id = auth.uid() AND f1.following_id = lives.host_id))
  OR (audience = 'subs_only' AND EXISTS (
       SELECT 1 FROM public.channel_subscriptions cs
       WHERE cs.subscriber_id = auth.uid() AND cs.creator_id = lives.host_id AND cs.status = 'active'))
);

DROP POLICY IF EXISTS "Recording visible" ON public.live_recordings;
CREATE POLICY "Recording visible" ON public.live_recordings FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = live_recordings.live_id
      AND (
        l.host_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = l.id AND m.user_id = auth.uid())
        OR l.audience = 'public'
        OR (l.audience = 'followers' AND EXISTS (
             SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = l.host_id))
        OR (l.audience = 'friends' AND EXISTS (
             SELECT 1 FROM public.follows f1 JOIN public.follows f2
               ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
             WHERE f1.follower_id = auth.uid() AND f1.following_id = l.host_id))
        OR (l.audience = 'subs_only' AND EXISTS (
             SELECT 1 FROM public.channel_subscriptions cs
             WHERE cs.subscriber_id = auth.uid() AND cs.creator_id = l.host_id AND cs.status = 'active'))
      )
  )
);
