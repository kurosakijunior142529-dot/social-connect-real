CREATE OR REPLACE FUNCTION public.is_live_host(_live_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.lives WHERE id = _live_id AND host_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.is_live_moderator(_live_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.live_moderators WHERE live_id = _live_id AND user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_live_host(uuid), public.is_live_moderator(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_live_host(uuid), public.is_live_moderator(uuid) TO authenticated;

DROP POLICY IF EXISTS "Lives visible" ON public.lives;
CREATE POLICY "Lives visible" ON public.lives FOR SELECT TO authenticated USING (
  host_id = auth.uid()
  OR public.is_live_moderator(id)
  OR audience = 'public'
  OR (audience = 'followers' AND EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = auth.uid() AND f.following_id = lives.host_id))
  OR (audience = 'friends' AND EXISTS (SELECT 1 FROM public.follows f1 JOIN public.follows f2 ON f1.follower_id = f2.following_id AND f1.following_id = f2.follower_id WHERE f1.follower_id = auth.uid() AND f1.following_id = lives.host_id))
  OR (audience = 'subs_only' AND EXISTS (SELECT 1 FROM public.channel_subscriptions cs WHERE cs.subscriber_id = auth.uid() AND cs.creator_id = lives.host_id AND cs.status = 'active'))
);

DROP POLICY IF EXISTS "Mods visible to host and self" ON public.live_moderators;
CREATE POLICY "Mods visible to host and self" ON public.live_moderators FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_live_host(live_id));
DROP POLICY IF EXISTS "Host add mods" ON public.live_moderators;
CREATE POLICY "Host add mods" ON public.live_moderators FOR INSERT TO authenticated WITH CHECK (public.is_live_host(live_id));
DROP POLICY IF EXISTS "Host remove mods" ON public.live_moderators;
CREATE POLICY "Host remove mods" ON public.live_moderators FOR DELETE TO authenticated USING (public.is_live_host(live_id));

DROP POLICY IF EXISTS "Bans visible" ON public.live_bans;
CREATE POLICY "Bans visible" ON public.live_bans FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_live_host(live_id) OR public.is_live_moderator(live_id));
DROP POLICY IF EXISTS "Host/mods insert bans" ON public.live_bans;
CREATE POLICY "Host/mods insert bans" ON public.live_bans FOR INSERT TO authenticated WITH CHECK (public.is_live_host(live_id) OR public.is_live_moderator(live_id));
DROP POLICY IF EXISTS "Host/mods remove bans" ON public.live_bans;
CREATE POLICY "Host/mods remove bans" ON public.live_bans FOR DELETE TO authenticated USING (public.is_live_host(live_id) OR public.is_live_moderator(live_id));

DROP POLICY IF EXISTS "Viewers visible" ON public.live_viewers;
CREATE POLICY "Viewers visible" ON public.live_viewers FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_live_host(live_id) OR public.is_live_moderator(live_id));