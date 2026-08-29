-- Live gifts: só a função send_live_gift (SECURITY DEFINER) pode inserir,
-- pois ela valida o catálogo e debita o saldo do remetente atomicamente.
REVOKE INSERT, UPDATE, DELETE ON public.live_gifts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.live_gifts FROM anon;
GRANT ALL ON public.live_gifts TO service_role;

-- Figurinhas: leitura restrita ao dono do arquivo OU a quem recebeu a
-- figurinha em uma conversa/grupo de que participa (mantém o envio no chat).
DROP POLICY IF EXISTS "Stickers read own" ON storage.objects;
CREATE POLICY "Stickers read own or received"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'stickers'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1
        FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
       WHERE m.media_bucket = 'stickers'
         AND m.media_url = storage.objects.name
         AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
    OR EXISTS (
      SELECT 1
        FROM public.chat_messages cm
       WHERE cm.media_bucket = 'stickers'
         AND cm.media_url = storage.objects.name
         AND public.is_chat_member(cm.chat_id, auth.uid())
    )
  )
);
