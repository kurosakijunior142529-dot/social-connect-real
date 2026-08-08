-- 1) Scope bank_accounts policies explicitly to authenticated users
DROP POLICY IF EXISTS "Own bank accounts" ON public.bank_accounts;
DROP POLICY IF EXISTS "Admins view all bank accounts" ON public.bank_accounts;

CREATE POLICY "Own bank accounts"
ON public.bank_accounts
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins view all bank accounts"
ON public.bank_accounts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.bank_accounts FROM anon;

-- 2) Remove anonymous EXECUTE on SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.enforce_dm_recipient_read_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_chat_meta(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_conversation_meta(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_chat_meta(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_conversation_meta(uuid, jsonb) TO authenticated;