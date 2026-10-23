CREATE OR REPLACE FUNCTION public.can_view_story(_owner uuid, _audience text, _expires timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND (_owner = auth.uid() OR (_expires > now() AND public.can_view_profile_content(_owner) AND (_audience = 'all' OR public.is_close_friend(_owner, auth.uid())) AND CASE COALESCE((SELECT story_audience FROM public.user_privacy WHERE user_id = _owner),'everyone') WHEN 'followers' THEN public.is_follower(_owner, auth.uid()) WHEN 'close_friends' THEN public.is_close_friend(_owner, auth.uid()) ELSE true END));
$$;
REVOKE ALL ON FUNCTION public.can_view_story(uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_story(uuid,text,timestamptz) TO authenticated;
DROP POLICY "Stories viewable by privacy" ON public.stories;
CREATE POLICY "Stories viewable by privacy" ON public.stories FOR SELECT TO authenticated USING (public.can_view_story(user_id,audience,expires_at));
CREATE OR REPLACE FUNCTION public.can_comment_on_post(_post uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = _post AND public.can_view_post(p.author_id,p.visibility,p.archived_at) AND NOT public.is_blocked_pair(auth.uid(),p.author_id) AND public.privacy_allows(p.author_id,p.comments_from) AND public.privacy_allows(p.author_id,COALESCE((SELECT comments_from FROM public.user_privacy WHERE user_id=p.author_id),'everyone')));
$$;
REVOKE ALL ON FUNCTION public.can_comment_on_post(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_comment_on_post(uuid) TO authenticated;
DROP POLICY "Users comment as self" ON public.comments;
CREATE POLICY "Users comment as self" ON public.comments FOR INSERT TO authenticated WITH CHECK (auth.uid()=author_id AND public.can_interact(auth.uid()) AND public.can_comment_on_post(post_id) AND (poll_id IS NULL OR public.owns_post(post_id,auth.uid())));
DROP POLICY "Participants send messages" ON public.messages;
CREATE POLICY "Participants send messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid()=sender_id AND public.can_message(auth.uid()) AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND auth.uid() IN (c.user_a,c.user_b) AND public.can_dm_user(CASE WHEN c.user_a=auth.uid() THEN c.user_b ELSE c.user_a END)));
CREATE OR REPLACE FUNCTION public.privacy_allows_group(_invitee uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT auth.uid() IS NOT NULL AND NOT public.is_blocked_pair(auth.uid(),_invitee) AND public.privacy_allows(_invitee,COALESCE((SELECT groups_from FROM public.user_privacy WHERE user_id=_invitee),'everyone')); $$;
REVOKE ALL ON FUNCTION public.privacy_allows_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privacy_allows_group(uuid) TO authenticated;
DROP POLICY "Chat admins can invite" ON public.chat_invites;
CREATE POLICY "Chat admins can invite" ON public.chat_invites FOR INSERT TO authenticated WITH CHECK (auth.uid()=inviter_id AND public.chat_role(chat_id,auth.uid()) IN ('owner','admin') AND NOT public.is_chat_member(chat_id,invitee_id) AND public.privacy_allows_group(invitee_id));
CREATE OR REPLACE FUNCTION public.guard_post_privacy() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF NEW.visibility NOT IN ('public','friends','me') OR NEW.comments_from NOT IN ('everyone','following','nobody') THEN RAISE EXCEPTION 'Preferência de publicação inválida'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_post_privacy BEFORE INSERT OR UPDATE OF visibility,comments_from ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_post_privacy();