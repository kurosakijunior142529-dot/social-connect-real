
-- Prevent reparenting on chat_invites via trigger (function already exists)
DROP TRIGGER IF EXISTS trg_prevent_chat_invite_reparent ON public.chat_invites;
CREATE TRIGGER trg_prevent_chat_invite_reparent
BEFORE UPDATE ON public.chat_invites
FOR EACH ROW EXECUTE FUNCTION public.prevent_chat_invite_reparent();

-- Tighten UPDATE policy WITH CHECK to identity of the acting party
DROP POLICY IF EXISTS "Invitee responds; inviter cancels" ON public.chat_invites;
CREATE POLICY "Invitee responds; inviter cancels"
ON public.chat_invites
FOR UPDATE
USING ((auth.uid() = invitee_id) OR (auth.uid() = inviter_id))
WITH CHECK ((auth.uid() = invitee_id) OR (auth.uid() = inviter_id));

-- Prevent reparenting on chat_members: only role may change
CREATE OR REPLACE FUNCTION public.prevent_chat_member_reparent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.chat_id <> OLD.chat_id OR NEW.user_id <> OLD.user_id THEN
    RAISE EXCEPTION 'chat_id and user_id are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_chat_member_reparent ON public.chat_members;
CREATE TRIGGER trg_prevent_chat_member_reparent
BEFORE UPDATE ON public.chat_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_chat_member_reparent();

-- Add WITH CHECK to owner/admin role update policy
DROP POLICY IF EXISTS "Owner/admin updates role" ON public.chat_members;
CREATE POLICY "Owner/admin updates role"
ON public.chat_members
FOR UPDATE
USING (chat_role(chat_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))
WITH CHECK (chat_role(chat_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]));
