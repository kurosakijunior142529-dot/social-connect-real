CREATE OR REPLACE FUNCTION public.can_view_live(_live uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lives l
    WHERE l.id = _live
      AND (
        l.host_id = _user
        OR EXISTS (SELECT 1 FROM public.live_moderators m WHERE m.live_id = l.id AND m.user_id = _user)
        OR l.audience = 'public'
        OR (l.audience = 'followers' AND EXISTS (
              SELECT 1 FROM public.follows f WHERE f.follower_id = _user AND f.following_id = l.host_id))
        OR (l.audience = 'friends' AND EXISTS (
              SELECT 1 FROM public.follows f1
              JOIN public.follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id
              WHERE f1.follower_id = _user AND f1.following_id = l.host_id))
        OR (l.audience = 'subs_only' AND EXISTS (
              SELECT 1 FROM public.channel_subscriptions cs
              WHERE cs.subscriber_id = _user AND cs.creator_id = l.host_id AND cs.status = 'active'))
      )
  );
$$;

DROP POLICY IF EXISTS "Chat visible" ON public.live_chat_messages;
CREATE POLICY "Chat visible" ON public.live_chat_messages
  FOR SELECT TO authenticated
  USING (public.can_view_live(live_id, auth.uid()));

DROP POLICY IF EXISTS "Gifts visible" ON public.live_gifts;
CREATE POLICY "Gifts visible" ON public.live_gifts
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR recipient_id = auth.uid()
    OR public.can_view_live(live_id, auth.uid())
  );
