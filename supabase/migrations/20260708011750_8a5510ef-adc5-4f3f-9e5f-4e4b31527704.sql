
DROP POLICY IF EXISTS "Sender edits own chat msg" ON public.chat_messages;
CREATE POLICY "Sender edits own chat msg" ON public.chat_messages
FOR UPDATE TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_chat_member(chat_id, auth.uid())
);

DROP POLICY IF EXISTS "Sender edits own DM" ON public.messages;
CREATE POLICY "Sender edits own DM" ON public.messages
FOR UPDATE TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
);

DROP POLICY IF EXISTS "Recipients mark read" ON public.messages;
CREATE POLICY "Recipients mark read" ON public.messages
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
  AND sender_id <> auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
  )
  AND sender_id <> auth.uid()
);
