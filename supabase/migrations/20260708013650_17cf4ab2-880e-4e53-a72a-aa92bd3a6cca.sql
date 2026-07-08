-- Fix chat_members self-join: require accepted invite OR admin/owner action
DROP POLICY IF EXISTS "Owner/admin add; user joins self" ON public.chat_members;
CREATE POLICY "Owner/admin add; user joins self" ON public.chat_members
FOR INSERT TO authenticated
WITH CHECK (
  chat_role(chat_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])
  OR (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.chat_invites ci
      WHERE ci.chat_id = chat_members.chat_id
        AND ci.invitee_id = auth.uid()
        AND ci.status = 'accepted'
    )
  )
);

-- Fix chat_invites UPDATE: add WITH CHECK preserving identity fields
DROP POLICY IF EXISTS "Invitee responds; inviter cancels" ON public.chat_invites;
CREATE POLICY "Invitee responds; inviter cancels" ON public.chat_invites
FOR UPDATE TO authenticated
USING ((auth.uid() = invitee_id) OR (auth.uid() = inviter_id))
WITH CHECK (
  ((auth.uid() = invitee_id) OR (auth.uid() = inviter_id))
);

-- Immutability trigger for chat_invites identity columns
CREATE OR REPLACE FUNCTION public.prevent_chat_invite_reparent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.chat_id <> OLD.chat_id
     OR NEW.inviter_id <> OLD.inviter_id
     OR NEW.invitee_id <> OLD.invitee_id THEN
    RAISE EXCEPTION 'chat_id, inviter_id and invitee_id are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_chat_invite_reparent_trg ON public.chat_invites;
CREATE TRIGGER prevent_chat_invite_reparent_trg
BEFORE UPDATE ON public.chat_invites
FOR EACH ROW EXECUTE FUNCTION public.prevent_chat_invite_reparent();