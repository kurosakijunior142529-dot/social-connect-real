
-- Service role gerencia subscriptions (para o webhook)
DROP POLICY IF EXISTS "Service role manages subscriptions" ON public.subscriptions;
CREATE POLICY "Service role manages subscriptions" ON public.subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.subscriptions TO service_role;

-- Service role gerencia user_coins e channel_subscriptions
GRANT ALL ON public.user_coins TO service_role;
GRANT ALL ON public.channel_subscriptions TO service_role;

-- Log de compras de moedas (idempotência + animação de conclusão)
CREATE TABLE IF NOT EXISTS public.coin_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id TEXT NOT NULL UNIQUE,
  price_id TEXT NOT NULL,
  coins INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL,
  currency TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'sandbox',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coin_purchases TO authenticated;
GRANT ALL ON public.coin_purchases TO service_role;
ALTER TABLE public.coin_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own coin purchases" ON public.coin_purchases
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages coin purchases" ON public.coin_purchases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Função atômica para creditar moedas
CREATE OR REPLACE FUNCTION public.credit_coins(_user UUID, _amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_balance INTEGER;
BEGIN
  INSERT INTO public.user_coins(user_id, balance)
  VALUES (_user, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance = public.user_coins.balance + _amount,
        updated_at = now()
  RETURNING balance INTO new_balance;
  RETURN new_balance;
END;
$$;

-- Checa se o usuário tem Vibely Pro ativo
CREATE OR REPLACE FUNCTION public.has_vibely_pro(_user UUID, _env TEXT DEFAULT 'sandbox')
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user
      AND environment = _env
      AND price_id IN ('vibely_pro_monthly','vibely_pro_yearly')
      AND (
        (status IN ('active','trialing') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;
